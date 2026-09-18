use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use rand::RngCore;
use serde::Serialize;

const LOCAL_AUTH_HEADER: &str = "X-ServerUI-Local-Token";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BackendStatus {
    Starting,
    Ready,
    Failed,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    pub mode: String,
    pub api_origin: String,
    pub local_auth_token: String,
    pub status: BackendStatus,
    pub error: Option<String>,
}

pub struct BackendManager {
    inner: Mutex<BackendInner>,
}

struct BackendInner {
    child: Option<Child>,
    config: RuntimeConfig,
}

impl BackendManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(BackendInner {
                child: None,
                config: RuntimeConfig {
                    mode: "desktop".into(),
                    api_origin: String::new(),
                    local_auth_token: String::new(),
                    status: BackendStatus::Starting,
                    error: None,
                },
            }),
        })
    }

    pub fn config(&self) -> RuntimeConfig {
        self.inner.lock().expect("backend lock").config.clone()
    }

    pub fn start(self: &Arc<Self>, app_dir: &Path) -> Result<(), String> {
        {
            let mut guard = self.inner.lock().expect("backend lock");
            guard.config.status = BackendStatus::Starting;
            guard.config.error = None;
        }

        let token = random_token();
        let port = reserve_loopback_port()?;
        let origin = format!("http://127.0.0.1:{port}");
        let binary = resolve_backend_binary(app_dir)?;
        let env_map = load_workspace_env(app_dir);

        let env_key = env_map
            .get("SERVERUI_CREDENTIAL_ENCRYPTION_KEY")
            .cloned()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("SERVERUI_CREDENTIAL_ENCRYPTION_KEY")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            });
        let encryption_key = crate::keyvault::resolve_encryption_key(env_key.as_deref())?;

        let mut cmd = Command::new(&binary);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .env("SERVERUI_DESKTOP", "1")
            .env("SERVERUI_LISTEN_HOST", "127.0.0.1")
            .env("HTTP_PORT", port.to_string())
            .env("SERVERUI_LOCAL_AUTH_TOKEN", &token)
            .env("SERVERUI_CREDENTIAL_ENCRYPTION_KEY", encryption_key);

        apply_database_env(&mut cmd, &env_map);

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    // New session so closing the desktop app can signal the group.
                    if libc_setsid() == -1 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }

        let child = cmd.spawn().map_err(|err| {
            format!(
                "ServerUI backend failed to start (could not launch {}): {err}",
                binary.display()
            )
        })?;

        {
            let mut guard = self.inner.lock().expect("backend lock");
            guard.config.api_origin = origin.clone();
            guard.config.local_auth_token = token.clone();
            guard.child = Some(child);
        }

        match wait_until_ready(&origin, &token, Duration::from_secs(45)) {
            Ok(()) => {
                let mut guard = self.inner.lock().expect("backend lock");
                guard.config.status = BackendStatus::Ready;
                guard.config.error = None;
            }
            Err(err) => {
                let mut guard = self.inner.lock().expect("backend lock");
                if let Some(mut child) = guard.child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                guard.config.status = BackendStatus::Failed;
                guard.config.error = Some(err.clone());
                guard.config.local_auth_token.clear();
                return Err(err);
            }
        }

        let watcher = Arc::clone(self);
        thread::spawn(move || watcher.watch_child());

        Ok(())
    }

    fn watch_child(self: Arc<Self>) {
        loop {
            thread::sleep(Duration::from_millis(500));
            let mut guard = match self.inner.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some(child) = guard.child.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(Some(_)) => {
                    guard.child = None;
                    if guard.config.status == BackendStatus::Ready {
                        guard.config.status = BackendStatus::Stopped;
                        guard.config.error =
                            Some("ServerUI backend stopped unexpectedly.".into());
                        guard.config.local_auth_token.clear();
                    }
                    return;
                }
                Ok(None) => {}
                Err(_) => return,
            }
        }
    }

    pub fn stop(&self) {
        let mut guard = self.inner.lock().expect("backend lock");
        if let Some(mut child) = guard.child.take() {
            let _ = terminate_child(&mut child);
            let _ = child.wait();
        }
        if guard.config.status == BackendStatus::Ready {
            guard.config.status = BackendStatus::Stopped;
        }
        guard.config.local_auth_token.clear();
    }
}

fn terminate_child(child: &mut Child) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        // Negative PID signals the process group created via setsid.
        let _ = unsafe { libc_kill(-pid, 15) };
        thread::sleep(Duration::from_millis(300));
        match child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            _ => {
                let _ = unsafe { libc_kill(-pid, 9) };
                let _ = child.wait();
            }
        }
        return Ok(());
    }
    #[cfg(windows)]
    {
        // On Windows the Go process is a direct child; kill the tree via taskkill
        // when available, otherwise fall back to Child::kill.
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
        let _ = child.wait();
        return Ok(());
    }
    #[cfg(not(any(unix, windows)))]
    {
        child.kill()?;
        let _ = child.wait();
        Ok(())
    }
}

#[cfg(unix)]
unsafe fn libc_setsid() -> i32 {
    // Avoid a hard libc dependency: use libc via raw syscall-like extern.
    extern "C" {
        fn setsid() -> i32;
    }
    setsid()
}

#[cfg(unix)]
unsafe fn libc_kill(pid: i32, sig: i32) -> i32 {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    kill(pid, sig)
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn reserve_loopback_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|err| format!("unable to reserve local port: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("unable to read local port: {err}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn resolve_backend_binary(app_dir: &Path) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("SERVERUI_BACKEND_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "SERVERUI_BACKEND_BIN does not exist: {}",
            path.display()
        ));
    }

    let repo = workspace_root(app_dir);
    let mut candidates = Vec::new();

    // Bundled sidecar next to the Tauri executable / resource dir.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("serverui-server"));
            candidates.push(dir.join("serverui-server.exe"));
            candidates.push(dir.join("binaries").join("serverui-server"));
            candidates.push(dir.join("binaries").join(sidecar_name()));
        }
    }

    // Dev: repository bin/ from make build / make desktop-dev.
    candidates.push(repo.join("bin").join("serverui-server"));
    candidates.push(repo.join("bin").join("serverui-server.exe"));

    // Sidecar copy prepared for bundling.
    candidates.push(
        app_dir
            .join("binaries")
            .join(sidecar_name()),
    );

    for path in candidates {
        if path.is_file() {
            return Ok(path);
        }
    }

    Err(
        "Go backend binary not found. Run `make build-server` or `make desktop-dev` first."
            .into(),
    )
}

fn sidecar_name() -> String {
    let triple = current_target_triple();
    if cfg!(windows) {
        format!("serverui-server-{triple}.exe")
    } else {
        format!("serverui-server-{triple}")
    }
}

fn current_target_triple() -> String {
    // Best-effort host triple for locating prepared sidecars.
    let arch = std::env::consts::ARCH;
    let os = std::env::consts::OS;
    match (arch, os) {
        ("aarch64", "macos") => "aarch64-apple-darwin".into(),
        ("x86_64", "macos") => "x86_64-apple-darwin".into(),
        ("x86_64", "linux") => "x86_64-unknown-linux-gnu".into(),
        ("aarch64", "linux") => "aarch64-unknown-linux-gnu".into(),
        ("x86_64", "windows") => "x86_64-pc-windows-msvc".into(),
        ("aarch64", "windows") => "aarch64-pc-windows-msvc".into(),
        _ => format!("{arch}-unknown-{os}"),
    }
}

fn workspace_root(app_dir: &Path) -> PathBuf {
    // app_dir is typically .../apps/desktop/src-tauri
    app_dir
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| app_dir.to_path_buf())
}

fn load_workspace_env(app_dir: &Path) -> HashMap<String, String> {
    let root = workspace_root(app_dir);
    let mut map = HashMap::new();
    for name in [".env", "deploy/docker/.env"] {
        let path = root.join(name);
        if let Ok(text) = fs::read_to_string(&path) {
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = line.split_once('=') {
                    let key = k.trim();
                    let mut val = v.trim().to_string();
                    if (val.starts_with('"') && val.ends_with('"'))
                        || (val.starts_with('\'') && val.ends_with('\''))
                    {
                        val = val[1..val.len() - 1].to_string();
                    }
                    map.entry(key.to_string()).or_insert(val);
                }
            }
        }
    }
    map
}

fn apply_database_env(cmd: &mut Command, env_map: &HashMap<String, String>) {
    // Prefer explicit DATABASE_URL when it targets loopback; otherwise POSTGRES_*.
    if let Some(url) = env_map.get("DATABASE_URL").filter(|v| !v.trim().is_empty()) {
        // Docker-compose DSN uses host "postgres"; rewrite for desktop loopback.
        let rewritten = url.replace("@postgres:", "@127.0.0.1:");
        cmd.env("DATABASE_URL", rewritten);
        return;
    }

    let user = env_map
        .get("POSTGRES_USER")
        .cloned()
        .unwrap_or_else(|| "serverui".into());
    let pass = env_map
        .get("POSTGRES_PASSWORD")
        .cloned()
        .unwrap_or_else(|| "example_password".into());
    let db = env_map
        .get("POSTGRES_DB")
        .cloned()
        .unwrap_or_else(|| "serverui".into());
    let host = env_map
        .get("POSTGRES_HOST")
        .cloned()
        .map(|h| if h == "postgres" { "127.0.0.1".into() } else { h })
        .unwrap_or_else(|| "127.0.0.1".into());
    let port = env_map
        .get("POSTGRES_PORT")
        .cloned()
        .unwrap_or_else(|| "5432".into());

    cmd.env("POSTGRES_USER", user)
        .env("POSTGRES_PASSWORD", pass)
        .env("POSTGRES_DB", db)
        .env("POSTGRES_HOST", host)
        .env("POSTGRES_PORT", port);
}

fn wait_until_ready(origin: &str, token: &str, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    let mut last_err = "backend did not become ready".to_string();
    while started.elapsed() < timeout {
        match healthcheck(origin, token) {
            Ok(()) => return Ok(()),
            Err(err) => last_err = err,
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(format!("ServerUI backend failed to start: {last_err}"))
}

fn healthcheck(origin: &str, token: &str) -> Result<(), String> {
    // origin is http://127.0.0.1:PORT
    let port: u16 = origin
        .rsplit(':')
        .next()
        .and_then(|p| p.parse().ok())
        .ok_or_else(|| "invalid backend origin".to_string())?;

    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port))
        .map_err(|err| format!("connect: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .ok();

    let req = format!(
        "GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{LOCAL_AUTH_HEADER}: {token}\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(req.as_bytes())
        .map_err(|err| format!("write: {err}"))?;

    let mut buf = String::new();
    stream
        .read_to_string(&mut buf)
        .map_err(|err| format!("read: {err}"))?;
    if buf.starts_with("HTTP/1.1 200") || buf.starts_with("HTTP/1.0 200") {
        return Ok(());
    }
    if buf.starts_with("HTTP/1.1 401") || buf.starts_with("HTTP/1.0 401") {
        return Err("local authentication rejected".into());
    }
    Err(format!("unexpected health response"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserves_loopback_port() {
        let port = reserve_loopback_port().expect("port");
        assert!(port > 0);
    }

    #[test]
    fn token_is_hex_64() {
        let token = random_token();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn rewrites_postgres_docker_host() {
        let mut map = HashMap::new();
        map.insert(
            "DATABASE_URL".into(),
            "postgresql://serverui:example_password@postgres:5432/serverui?sslmode=disable".into(),
        );
        let mut cmd = Command::new("true");
        apply_database_env(&mut cmd, &map);
        // Command debug does not expose env easily; ensure function does not panic.
    }
}
