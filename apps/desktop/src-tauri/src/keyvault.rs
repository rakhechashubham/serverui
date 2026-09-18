use keyring::Entry;
use rand::RngCore;

const SERVICE: &str = "com.serverui.desktop";
const ACCOUNT: &str = "credential-encryption-key";

/// Resolve the AES credential encryption key for the Go child process.
///
/// Prefer OS keychain (macOS Keychain / Windows Credential Manager / Linux
/// Secret Service). Fall back to workspace `.env` for developer machines
/// without a keyring daemon. Never returns the key to the WebView.
pub fn resolve_encryption_key(env_fallback: Option<&str>) -> Result<String, String> {
    if let Ok(entry) = Entry::new(SERVICE, ACCOUNT) {
        match entry.get_password() {
            Ok(existing) if !existing.trim().is_empty() => {
                return Ok(existing.trim().to_string());
            }
            Ok(_) | Err(keyring::Error::NoEntry) => {}
            Err(err) => {
                // Keyring unavailable (common on headless Linux CI). Fall through.
                let _ = err;
            }
        }

        if let Some(from_env) = env_fallback.map(str::trim).filter(|v| !v.is_empty()) {
            let _ = entry.set_password(from_env);
            return Ok(from_env.to_string());
        }

        let generated = random_hex_key();
        match entry.set_password(&generated) {
            Ok(()) => return Ok(generated),
            Err(_) => {
                // Could not persist; still allow this launch with the generated key
                // when no env fallback exists (ephemeral — next launch regenerates
                // unless .env provides a stable key).
                return Ok(generated);
            }
        }
    }

    if let Some(from_env) = env_fallback.map(str::trim).filter(|v| !v.is_empty()) {
        return Ok(from_env.to_string());
    }
    Err(
        "SERVERUI_CREDENTIAL_ENCRYPTION_KEY is missing and OS keychain is unavailable. Run make setup-env."
            .into(),
    )
}

fn random_hex_key() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_hex_64() {
        let key = random_hex_key();
        assert_eq!(key.len(), 64);
    }
}
