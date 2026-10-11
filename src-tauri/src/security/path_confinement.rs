use std::path::{Path, PathBuf};
use std::fs;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ConfinementError {
    #[error("Chemin invalide ou introuvable : {0}")]
    InvalidPath(String),
    #[error("Accès hors du workspace interdit (tentative d'évasion) : '{0}'")]
    PathEscaped(String),
    #[error("Accès interdit au fichier sensible critique : '{0}'")]
    SensitiveFileBlocked(String),
    #[error("Lien symbolique dangereux pointant en dehors du workspace : '{0}'")]
    DanglingOrExternalSymlink(String),
}

pub struct PathConfinement {
    workspace_root: PathBuf,
}

impl PathConfinement {
    pub fn new<P: AsRef<Path>>(workspace_root: P) -> Result<Self, ConfinementError> {
        let canonical_root = fs::canonicalize(&workspace_root).map_err(|e| {
            ConfinementError::InvalidPath(format!("{}: {}", workspace_root.as_ref().display(), e))
        })?;
        Ok(Self {
            workspace_root: canonical_root,
        })
    }

    pub fn workspace_root(&self) -> &Path {
        &self.workspace_root
    }

    /// Vérifie si un chemin est autorisé dans le workspace sans retourner d'erreur.
    /// Effectue les vérifications pré et post-canonisation :
    /// a) démarre par `canonical_root` (workspace_root)
    /// b) ne correspond à aucun motif de fichier sensible (.env*, .git/*, .ssh/*, id_rsa*, credentials*, etc.)
    pub fn is_path_allowed<P: AsRef<Path>>(&self, target_path: P) -> bool {
        let raw_path = target_path.as_ref();
        let raw_str = raw_path.to_string_lossy();
        let trimmed = raw_str.trim();

        if trimmed.is_empty() || trimmed == "." || trimmed == "./" || trimmed == "/" || trimmed == "/." {
            return true;
        }

        let full_path = if raw_path.is_absolute() {
            if raw_path.starts_with(&self.workspace_root) {
                raw_path.to_path_buf()
            } else if let Ok(rel) = raw_path.strip_prefix("/") {
                let candidate = self.workspace_root.join(rel);
                if candidate.exists() {
                    candidate
                } else {
                    raw_path.to_path_buf()
                }
            } else {
                raw_path.to_path_buf()
            }
        } else {
            self.workspace_root.join(raw_path)
        };

        // Pré-vérification : motifs sensibles sur le chemin cible
        if self.check_sensitive_patterns(&full_path).is_err() {
            return false;
        }

        // Vérification proactive des liens symboliques
        if full_path.is_symlink() {
            if let Ok(link_target) = fs::read_link(&full_path) {
                let resolved_symlink = if link_target.is_absolute() {
                    link_target
                } else {
                    full_path.parent().unwrap_or(&self.workspace_root).join(link_target)
                };
                if let Ok(canonical_symlink) = fs::canonicalize(&resolved_symlink) {
                    if !canonical_symlink.starts_with(&self.workspace_root)
                        || self.check_sensitive_patterns(&canonical_symlink).is_err()
                    {
                        return false;
                    }
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }

        // Post-canonicalization check
        if full_path.exists() {
            match fs::canonicalize(&full_path) {
                Ok(canonical_target) => {
                    // a) starts with canonical_root
                    if !canonical_target.starts_with(&self.workspace_root) {
                        return false;
                    }
                    // b) does not match any sensitive file patterns (.env*, .git/*, .ssh/*, id_rsa*, credentials*, etc.)
                    if self.check_sensitive_patterns(&canonical_target).is_err() {
                        return false;
                    }
                    true
                }
                Err(_) => false,
            }
        } else {
            match self.resolve_and_verify(target_path) {
                Ok(canonical_target) => {
                    canonical_target.starts_with(&self.workspace_root)
                        && self.check_sensitive_patterns(&canonical_target).is_ok()
                }
                Err(_) => false,
            }
        }
    }

    /// Vérifie et résout de manière sécurisée un chemin relatif ou absolu vers un fichier/dossier
    /// dans le workspace. Refuse toute sortie via symlink, '..' ou chemin absolu externe.
    pub fn resolve_and_verify<P: AsRef<Path>>(&self, target: P) -> Result<PathBuf, ConfinementError> {
        let raw_path = target.as_ref();
        let raw_str = raw_path.to_string_lossy();
        let trimmed = raw_str.trim();

        // 0. Si le chemin désigne la racine du workspace ("", ".", "./", "/")
        if trimmed.is_empty() || trimmed == "." || trimmed == "./" || trimmed == "/" || trimmed == "/." {
            return Ok(self.workspace_root.clone());
        }

        // 1. Déterminer le chemin complet à vérifier
        let full_path = if raw_path.is_absolute() {
            if raw_path.starts_with(&self.workspace_root) {
                raw_path.to_path_buf()
            } else if let Ok(rel) = raw_path.strip_prefix("/") {
                // Si l'IA a mis un slash initial (ex: "/src/main.rs" ou "/package.json")
                let candidate = self.workspace_root.join(rel);
                if candidate.exists() {
                    candidate
                } else {
                    raw_path.to_path_buf()
                }
            } else {
                raw_path.to_path_buf()
            }
        } else {
            self.workspace_root.join(raw_path)
        };

        // 2. Vérification pré-résolution des fichiers sensibles interdits
        self.check_sensitive_patterns(&full_path)?;

        // 3. Gestion proactive et sécurisation des liens symboliques
        if full_path.is_symlink() {
            let link_target = fs::read_link(&full_path).map_err(|e| {
                ConfinementError::InvalidPath(format!("Erreur lecture lien: {}", e))
            })?;
            let resolved_symlink = if link_target.is_absolute() {
                link_target
            } else {
                full_path.parent().unwrap_or(&self.workspace_root).join(link_target)
            };
            let canonical_symlink = fs::canonicalize(&resolved_symlink).map_err(|_| {
                ConfinementError::DanglingOrExternalSymlink(full_path.display().to_string())
            })?;
            if !canonical_symlink.starts_with(&self.workspace_root) {
                return Err(ConfinementError::DanglingOrExternalSymlink(format!(
                    "Symlink pointe hors du workspace: {} -> {}",
                    full_path.display(),
                    canonical_symlink.display()
                )));
            }
            self.check_sensitive_patterns(&canonical_symlink)?;
        }

        // 4. Résolution canonique
        let canonical_target = if full_path.exists() {
            fs::canonicalize(&full_path).map_err(|e| {
                ConfinementError::InvalidPath(format!("{}: {}", full_path.display(), e))
            })?
        } else {
            // Le fichier n'existe pas encore (création potentielle)
            // Trouver le premier ancêtre existant
            let mut ancestor = full_path.as_path();
            let mut relative_trail = Vec::new();

            while !ancestor.exists() {
                if let Some(file_name) = ancestor.file_name() {
                    relative_trail.push(file_name);
                }
                match ancestor.parent() {
                    Some(parent) => ancestor = parent,
                    None => {
                        return Err(ConfinementError::InvalidPath(format!(
                            "Aucun ancêtre valide trouvé pour {}",
                            full_path.display()
                        )))
                    }
                }
            }

            let canonical_ancestor = fs::canonicalize(ancestor).map_err(|e| {
                ConfinementError::InvalidPath(format!("{}: {}", ancestor.display(), e))
            })?;

            if !canonical_ancestor.starts_with(&self.workspace_root) {
                return Err(ConfinementError::PathEscaped(full_path.display().to_string()));
            }

            // Reconstruire le chemin cible canonisé pour l'ancêtre
            let mut resolved = canonical_ancestor;
            for component in relative_trail.into_iter().rev() {
                // Empêcher les composantes malveillantes
                let comp_str = component.to_string_lossy();
                if comp_str == ".." || comp_str == "." {
                    return Err(ConfinementError::PathEscaped(full_path.display().to_string()));
                }
                resolved.push(component);
            }
            resolved
        };

        // 5. Post-canonicalization check :
        // a) La cible canonique doit débuter par le canonical_root (self.workspace_root)
        if !canonical_target.starts_with(&self.workspace_root) {
            if full_path.is_symlink() {
                return Err(ConfinementError::DanglingOrExternalSymlink(format!(
                    "Symlink pointe hors du workspace: {} -> {}",
                    full_path.display(),
                    canonical_target.display()
                )));
            }
            return Err(ConfinementError::PathEscaped(
                canonical_target.display().to_string(),
            ));
        }

        // b) La cible canonique ne doit correspondre à aucun motif sensible (.env*, .git/*, .ssh/*, id_rsa*, credentials*, etc.)
        self.check_sensitive_patterns(&canonical_target)?;

        Ok(canonical_target)
    }

    /// Bloque les fichiers d'informations d'identification hautement sensibles.
    /// Vérifie les motifs sensibles (.env*, .git/*, .ssh/*, id_rsa*, credentials*, etc.)
    /// ainsi que la liste étendue (.env.development, .env.test, .env.staging, .git/config,
    /// id_ed25519, known_hosts, aws/credentials, gcloud).
    pub fn check_sensitive_patterns(&self, path: &Path) -> Result<(), ConfinementError> {
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        let path_str = path.to_string_lossy().to_lowercase().replace('\\', "/");

        // 1. Liste explicite de noms sensibles exacts
        let sensitive_names = [
            ".env",
            ".env.local",
            ".env.production",
            ".env.staging",
            ".env.development",
            ".env.test",
            "id_rsa",
            "id_ecdsa",
            "id_ed25519",
            "id_dsa",
            "known_hosts",
            "authorized_keys",
            "gcloud",
        ];

        for &sensitive in &sensitive_names {
            if file_name == sensitive {
                return Err(ConfinementError::SensitiveFileBlocked(file_name));
            }
        }

        // 2. Préfixes sensibles sur le nom de fichier (.env*, id_rsa*, credentials*, etc.)
        if file_name.starts_with(".env")
            || file_name.starts_with("id_rsa")
            || file_name.starts_with("id_ecdsa")
            || file_name.starts_with("id_ed25519")
            || file_name.starts_with("id_dsa")
            || file_name.starts_with("credentials")
        {
            return Err(ConfinementError::SensitiveFileBlocked(file_name));
        }

        // 3. Extensions de clés privées
        if file_name.ends_with(".key") || file_name.ends_with(".pem") || file_name.ends_with(".pfx") {
            return Err(ConfinementError::SensitiveFileBlocked(file_name));
        }

        // 4. Composants de chemin sensibles (.git/*, .ssh/*, .gnupg/*, aws/credentials, gcloud, etc.)
        let has_component = |comp: &str| {
            path.components().any(|c| c.as_os_str().to_string_lossy().to_lowercase() == comp)
        };

        // .git/* et .git/config
        if has_component(".git")
            || path_str.contains("/.git/")
            || path_str.ends_with("/.git")
            || path_str.starts_with(".git/")
            || path_str == ".git"
            || path_str.contains(".git/config")
        {
            return Err(ConfinementError::SensitiveFileBlocked(path_str));
        }

        // .ssh/*
        if has_component(".ssh")
            || path_str.contains("/.ssh/")
            || path_str.ends_with("/.ssh")
            || path_str.starts_with(".ssh/")
            || path_str == ".ssh"
        {
            return Err(ConfinementError::SensitiveFileBlocked(path_str));
        }

        // .gnupg/*
        if has_component(".gnupg")
            || path_str.contains("/.gnupg/")
            || path_str.ends_with("/.gnupg")
            || path_str.starts_with(".gnupg/")
            || path_str == ".gnupg"
        {
            return Err(ConfinementError::SensitiveFileBlocked(path_str));
        }

        // .aws/* et aws/credentials
        if has_component(".aws")
            || path_str.contains("/.aws/")
            || path_str.ends_with("/.aws")
            || path_str.starts_with(".aws/")
            || path_str == ".aws"
            || path_str.contains("aws/credentials")
            || ((has_component("aws") || path_str.contains("/aws/"))
                && (file_name.starts_with("credentials") || file_name.starts_with("config")))
        {
            return Err(ConfinementError::SensitiveFileBlocked(path_str));
        }

        // gcloud (dossier ou fichier de configuration cloud)
        if has_component("gcloud")
            || has_component(".gcloud")
            || path_str.contains("/gcloud/")
            || path_str.ends_with("/gcloud")
            || path_str.starts_with("gcloud/")
            || path_str == "gcloud"
            || path_str.contains("/.gcloud/")
            || path_str.ends_with("/.gcloud")
            || path_str.starts_with(".gcloud/")
            || path_str == ".gcloud"
            || path_str.contains(".config/gcloud")
        {
            return Err(ConfinementError::SensitiveFileBlocked(path_str));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_valid_file_within_workspace() {
        let dir = tempdir().unwrap();
        let ws_path = dir.path();
        let confinement = PathConfinement::new(ws_path).unwrap();

        let sub_file = ws_path.join("test.txt");
        File::create(&sub_file).unwrap();

        let resolved = confinement.resolve_and_verify("test.txt").unwrap();
        assert_eq!(resolved, fs::canonicalize(&sub_file).unwrap());
    }

    #[test]
    fn test_escape_via_dot_dot_blocked() {
        let dir = tempdir().unwrap();
        let ws_path = dir.path().join("sub_workspace");
        fs::create_dir_all(&ws_path).unwrap();
        let confinement = PathConfinement::new(&ws_path).unwrap();

        // Tenter de sortir via ../
        let result = confinement.resolve_and_verify("../secret.txt");
        assert!(matches!(result, Err(ConfinementError::PathEscaped(_))));
    }

    #[test]
    fn test_escape_via_absolute_system_path_blocked() {
        let dir = tempdir().unwrap();
        let confinement = PathConfinement::new(dir.path()).unwrap();

        let result = confinement.resolve_and_verify("/etc/passwd");
        assert!(matches!(result, Err(ConfinementError::PathEscaped(_))));
    }

    #[test]
    fn test_sensitive_env_file_blocked() {
        let dir = tempdir().unwrap();
        let confinement = PathConfinement::new(dir.path()).unwrap();

        let result = confinement.resolve_and_verify(".env");
        assert!(matches!(result, Err(ConfinementError::SensitiveFileBlocked(_))));
    }

    #[test]
    fn test_extended_sensitive_patterns_blocked() {
        let dir = tempdir().unwrap();
        let confinement = PathConfinement::new(dir.path()).unwrap();

        let extended_sensitive = [
            ".env.development",
            ".env.test",
            ".env.staging",
            ".git/config",
            "id_ed25519",
            "known_hosts",
            "aws/credentials",
            "gcloud",
            "credentials.json",
            "id_rsa.pub",
        ];

        for pattern in &extended_sensitive {
            let res = confinement.resolve_and_verify(pattern);
            assert!(
                matches!(res, Err(ConfinementError::SensitiveFileBlocked(_))),
                "Pattern '{}' should be blocked by SensitiveFileBlocked but got {:?}",
                pattern,
                res
            );
            assert!(
                !confinement.is_path_allowed(pattern),
                "Pattern '{}' should not be allowed by is_path_allowed",
                pattern
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn test_symlink_escape_outside_workspace_blocked() {
        use std::os::unix::fs::symlink;

        let dir = tempdir().unwrap();
        let ws_path = dir.path().join("workspace");
        let outside_path = dir.path().join("outside");
        fs::create_dir_all(&ws_path).unwrap();
        fs::create_dir_all(&outside_path).unwrap();

        let confinement = PathConfinement::new(&ws_path).unwrap();

        // Créer un fichier en dehors du workspace
        let secret_file = outside_path.join("secret.txt");
        File::create(&secret_file).unwrap();

        // Créer un lien symbolique dans le workspace pointant vers ce fichier extérieur
        let link_path = ws_path.join("leak_link.txt");
        symlink(&secret_file, &link_path).unwrap();

        let res = confinement.resolve_and_verify("leak_link.txt");
        assert!(
            matches!(
                res,
                Err(ConfinementError::DanglingOrExternalSymlink(_))
                    | Err(ConfinementError::PathEscaped(_))
            ),
            "Symlink escaping workspace must be blocked, got {:?}",
            res
        );
        assert!(!confinement.is_path_allowed("leak_link.txt"));
    }

    #[cfg(unix)]
    #[test]
    fn test_dangling_symlink_blocked() {
        use std::os::unix::fs::symlink;

        let dir = tempdir().unwrap();
        let ws_path = dir.path();
        let confinement = PathConfinement::new(ws_path).unwrap();

        // Symlink pointant vers un fichier inexistant
        let broken_link = ws_path.join("broken_link");
        symlink(ws_path.join("nonexistent_target_xyz"), &broken_link).unwrap();

        let res = confinement.resolve_and_verify("broken_link");
        assert!(
            matches!(res, Err(ConfinementError::DanglingOrExternalSymlink(_))),
            "Dangling symlink must return DanglingOrExternalSymlink, got {:?}",
            res
        );
        assert!(!confinement.is_path_allowed("broken_link"));
    }

    #[cfg(unix)]
    #[test]
    fn test_symlink_to_sensitive_file_inside_workspace_blocked() {
        use std::os::unix::fs::symlink;

        let dir = tempdir().unwrap();
        let ws_path = dir.path();
        let confinement = PathConfinement::new(ws_path).unwrap();

        // Créer un fichier .env réel
        let env_file = ws_path.join(".env");
        fs::write(&env_file, "SECRET=supersecret").unwrap();

        // Créer un lien symbolique innocent pointant vers .env
        let innocent_link = ws_path.join("innocent_notes.txt");
        symlink(&env_file, &innocent_link).unwrap();

        let res = confinement.resolve_and_verify("innocent_notes.txt");
        assert!(
            matches!(res, Err(ConfinementError::SensitiveFileBlocked(_))),
            "Symlink pointing to sensitive .env must be blocked post-canonicalization, got {:?}",
            res
        );
        assert!(!confinement.is_path_allowed("innocent_notes.txt"));

        // Créer .git/config et un lien vers lui
        let git_dir = ws_path.join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        let git_config = git_dir.join("config");
        fs::write(&git_config, "[core]\nrepositoryformatversion = 0").unwrap();

        let innocent_git_link = ws_path.join("git_alias");
        symlink(&git_config, &innocent_git_link).unwrap();

        let res_git = confinement.resolve_and_verify("git_alias");
        assert!(
            matches!(res_git, Err(ConfinementError::SensitiveFileBlocked(_))),
            "Symlink pointing to .git/config must be blocked post-canonicalization, got {:?}",
            res_git
        );
        assert!(!confinement.is_path_allowed("git_alias"));
    }

    #[test]
    fn test_is_path_allowed_valid_and_invalid() {
        let dir = tempdir().unwrap();
        let ws_path = dir.path();
        let confinement = PathConfinement::new(ws_path).unwrap();

        let valid_file = ws_path.join("hello.rs");
        File::create(&valid_file).unwrap();

        assert!(confinement.is_path_allowed("hello.rs"));
        assert!(confinement.is_path_allowed("."));
        assert!(confinement.is_path_allowed(""));

        // Invalid paths
        assert!(!confinement.is_path_allowed("../outside.txt"));
        assert!(!confinement.is_path_allowed("/etc/shadow"));
        assert!(!confinement.is_path_allowed(".env"));
        assert!(!confinement.is_path_allowed(".env.development"));
        assert!(!confinement.is_path_allowed(".git/config"));
        assert!(!confinement.is_path_allowed("aws/credentials"));
        assert!(!confinement.is_path_allowed("id_ed25519"));
        assert!(!confinement.is_path_allowed("known_hosts"));
        assert!(!confinement.is_path_allowed("gcloud"));
    }
}
