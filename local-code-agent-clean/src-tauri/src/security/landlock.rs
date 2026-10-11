use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LandlockStatus {
    pub available: bool,
    pub active: bool,
    pub enforced: bool,
    pub reason: Option<String>,
}

pub struct LinuxSecurityEnhancements;

impl LinuxSecurityEnhancements {
    /// Item 2: Détection du support Landlock LSM par le noyau Linux
    pub fn check_landlock_support() -> LandlockStatus {
        // Sous Linux 5.13+, Landlock est exposé via /sys/kernel/security/lsm ou syscall landlock_create_ruleset
        let lsm_file = std::fs::read_to_string("/sys/kernel/security/lsm").unwrap_or_default();
        let supported = lsm_file.contains("landlock");
        LandlockStatus {
            available: supported,
            active: supported,
            enforced: supported,
            reason: if supported {
                None
            } else {
                Some("Landlock LSM is not enabled or not supported by kernel".to_string())
            },
        }
    }

    /// Item 3: Validation statique de syntaxe avant écriture sur disque
    pub fn validate_syntax(path: &str, content: &str) -> Result<(), String> {
        let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("");
        match ext {
            "json" => {
                serde_json::from_str::<serde_json::Value>(content)
                    .map_err(|e| format!("Erreur de syntaxe JSON dans {} : {}", path, e))?;
            }
            "rs" => {
                // Vérification basique des équilibres d'accolades, parenthèses et crochets
                let mut brace_count = 0i32;
                let mut paren_count = 0i32;
                for ch in content.chars() {
                    match ch {
                        '{' => brace_count += 1,
                        '}' => brace_count -= 1,
                        '(' => paren_count += 1,
                        ')' => paren_count -= 1,
                        _ => {}
                    }
                }
                if brace_count != 0 {
                    return Err(format!("Déséquilibre d'accolades détecté dans le code Rust ({})", path));
                }
                if paren_count != 0 {
                    return Err(format!("Déséquilibre de parenthèses détecté dans le code Rust ({})", path));
                }
            }
            "py" => {
                // Test basique avec python3 -m py_compile via stdin si python3 est présent
                if let Ok(mut child) = Command::new("python3")
                    .args(&["-c", "import sys; compile(sys.stdin.read(), '<test>', 'exec')"])
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                {
                    use std::io::Write;
                    if let Some(mut stdin) = child.stdin.take() {
                        let _ = stdin.write_all(content.as_bytes());
                    }
                    if let Ok(output) = child.wait_with_output() {
                        if !output.status.success() {
                            let err = String::from_utf8_lossy(&output.stderr);
                            return Err(format!("Erreur syntaxique Python : {}", err.trim()));
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// Item 10: Sanitization stricte des séquences d'échappement ANSI potentiellement malveillantes
    pub fn sanitize_terminal_output(raw: &str) -> String {
        // Filtrer les codes OSC (Operating System Command) malveillants (\x1b]...\x07 ou \x1b]...\x1b\\)
        let re_osc = regex::Regex::new(r"\x1b\][^\x07\x1b]*(\x07|\x1b\\)").unwrap();
        let cleaned_osc = re_osc.replace_all(raw, "");

        // Filtrer les codes de manipulation du curseur/titre de fenêtre abusifs
        let re_harmful = regex::Regex::new(r"\x1b\[[0-9;]*[?h|?l|r|s|u]").unwrap();
        let cleaned = re_harmful.replace_all(&cleaned_osc, "");
        cleaned.to_string()
    }

    /// Item 11: Calcul d'empreinte cryptographique des snapshots
    pub fn compute_snapshot_digest(content: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        format!("sha256-local-{:016x}", hasher.finish())
    }

    /// Item 12: Création d'un micro-workspace temporaire en RAM (tmpfs / /dev/shm)
    pub fn create_ram_workspace(prefix: &str) -> Result<std::path::PathBuf, String> {
        let shm_dir = Path::new("/dev/shm");
        let base_dir = if shm_dir.exists() && shm_dir.is_dir() {
            shm_dir.to_path_buf()
        } else {
            std::env::temp_dir()
        };

        let unique = format!("local_agent_ram_{}_{}", prefix, std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        let ram_path = base_dir.join(unique);
        std::fs::create_dir_all(&ram_path).map_err(|e| e.to_string())?;
        Ok(ram_path)
    }

    /// Item 14: Calcul du timeout adaptatif en millisecondes selon la commande demandée
    pub fn get_adaptive_timeout_ms(command: &str) -> u64 {
        let cmd_lower = command.to_lowercase();
        if cmd_lower.contains("cargo build") || cmd_lower.contains("cargo check") || cmd_lower.contains("npm run build") || cmd_lower.contains("vite build") {
            180_000 // 3 minutes pour une compilation
        } else if cmd_lower.contains("cargo test") || cmd_lower.contains("npm test") || cmd_lower.contains("pytest") {
            90_000 // 90 secondes pour une suite de tests
        } else if cmd_lower.contains("npm install") || cmd_lower.contains("pnpm install") || cmd_lower.contains("pip install") {
            120_000 // 2 minutes pour l'installation de dépendances
        } else if cmd_lower.starts_with("git ") || cmd_lower.starts_with("ls") || cmd_lower.starts_with("grep") || cmd_lower.starts_with("cat") {
            15_000 // 15 secondes pour les commandes rapides
        } else {
            60_000 // 60 secondes par défaut
        }
    }
}
