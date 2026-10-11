use std::fs;
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::security::{ConfinementError, PathConfinement};

pub const MAX_CHECKPOINTS: usize = 20;
pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 Mo

pub const EXCLUDED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".venv",
    "dist",
    "build",
    ".gemini",
    ".local_agent",
];

pub const EXCLUDED_EXTENSIONS: &[&str] = &[
    // Images
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "ico",
    // Audio / Vidéo
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v",
    "mp3", "wav", "ogg", "flac", "aac", "m4a", "wma",
    // Archives & gros binaires
    "zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst",
    "iso", "bin", "exe", "dmg", "pkg", "deb", "rpm",
];

pub fn is_excluded_dir_name(name: &str) -> bool {
    EXCLUDED_DIRS.contains(&name)
}

pub fn is_excluded_media_or_archive(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    if name.ends_with(".tar.gz")
        || name.ends_with(".tar.bz2")
        || name.ends_with(".tar.xz")
    {
        return true;
    }

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        if EXCLUDED_EXTENSIONS.contains(&ext_lower.as_str()) {
            return true;
        }
    }

    false
}

pub fn is_file_too_large(path: &Path) -> bool {
    if let Ok(meta) = fs::metadata(path) {
        meta.len() > MAX_FILE_SIZE
    } else {
        false
    }
}

#[derive(Error, Debug)]
pub enum CheckpointError {
    #[error("Erreur I/O checkpoint : {0}")]
    Io(#[from] std::io::Error),
    #[error("Checkpoint non trouvé : {0}")]
    NotFound(String),
    #[error("ID de checkpoint invalide : {0}")]
    InvalidId(String),
    #[error("Erreur de confinement : {0}")]
    Confinement(#[from] ConfinementError),
    #[error("Erreur de sécurité checkpoint : {0}")]
    SecurityError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub description: String,
    pub files_count: usize,
}

pub struct CheckpointManager {
    workspace_root: PathBuf,
    checkpoints_dir: PathBuf,
    confinement: PathConfinement,
}

impl Clone for CheckpointManager {
    fn clone(&self) -> Self {
        Self {
            workspace_root: self.workspace_root.clone(),
            checkpoints_dir: self.checkpoints_dir.clone(),
            confinement: PathConfinement::new(&self.workspace_root)
                .expect("Workspace root is already canonical and valid"),
        }
    }
}

impl CheckpointManager {
    pub fn new<P: AsRef<Path>>(workspace_root: P) -> Result<Self, CheckpointError> {
        let ws = workspace_root.as_ref().to_path_buf();
        let canonical_ws = fs::canonicalize(&ws)?;
        let cp_dir = canonical_ws.join(".local_agent").join("checkpoints");
        fs::create_dir_all(&cp_dir)?;
        let confinement = PathConfinement::new(&canonical_ws)?;
        Ok(Self {
            workspace_root: canonical_ws,
            checkpoints_dir: cp_dir,
            confinement,
        })
    }

    /// Valide que l'identifiant du checkpoint est un UUID conforme
    pub fn validate_checkpoint_id(checkpoint_id: &str) -> Result<Uuid, CheckpointError> {
        Uuid::parse_str(checkpoint_id).map_err(|_| {
            CheckpointError::InvalidId(format!(
                "ID de checkpoint invalide (UUID attendu) : '{}'",
                checkpoint_id
            ))
        })
    }

    /// Supprime automatiquement les checkpoints les plus anciens en ordre FIFO
    /// afin de maintenir le quota strict MAX_CHECKPOINTS.
    pub fn prune_old_checkpoints(&self) -> Result<usize, CheckpointError> {
        let mut checkpoints = self.list_checkpoints()?;
        let mut pruned = 0;
        if checkpoints.len() > MAX_CHECKPOINTS {
            // list_checkpoints trie par timestamp décroissant (les plus récents en premier).
            // Les éléments après MAX_CHECKPOINTS sont donc les plus anciens (FIFO).
            let to_prune = checkpoints.split_off(MAX_CHECKPOINTS);
            for cp in to_prune {
                let cp_dir = self.checkpoints_dir.join(&cp.id);
                if cp_dir.exists() {
                    let _ = fs::remove_dir_all(cp_dir);
                    pruned += 1;
                }
            }
        }
        Ok(pruned)
    }

    /// Crée un instantané de tous les fichiers du projet en appliquant les exclusions
    pub fn create_checkpoint(&self, description: &str) -> Result<Checkpoint, CheckpointError> {
        let id = Uuid::new_v4().to_string();
        let target_dir = self.checkpoints_dir.join(&id);
        fs::create_dir_all(&target_dir)?;

        let timestamp = Utc::now();
        let mut files_count = 0;

        for entry in WalkDir::new(&self.workspace_root)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                if e.file_type().is_dir() {
                    !is_excluded_dir_name(&name)
                } else {
                    !is_excluded_media_or_archive(e.path())
                }
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            if path == self.workspace_root {
                continue;
            }

            let rel_path = match path.strip_prefix(&self.workspace_root) {
                Ok(p) => p,
                Err(_) => continue,
            };

            let dest_path = target_dir.join(rel_path);

            if entry.file_type().is_dir() {
                fs::create_dir_all(&dest_path)?;
            } else if entry.file_type().is_file() {
                if is_excluded_media_or_archive(path) {
                    continue;
                }
                if let Ok(meta) = entry.metadata() {
                    if meta.len() > MAX_FILE_SIZE {
                        continue;
                    }
                }
                if let Some(parent) = dest_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                if let Ok(_) = fs::copy(path, &dest_path) {
                    files_count += 1;
                }
            }
        }

        let cp = Checkpoint {
            id: id.clone(),
            timestamp,
            description: description.to_string(),
            files_count,
        };

        // Sauvegarder les métadonnées
        let meta_file = target_dir.join("metadata.json");
        let meta_json = serde_json::to_string_pretty(&cp).map_err(|e| {
            CheckpointError::Io(std::io::Error::new(std::io::ErrorKind::Other, e))
        })?;
        fs::write(meta_file, meta_json)?;

        // Élaguer automatiquement les anciens checkpoints en FIFO pour respecter MAX_CHECKPOINTS
        let _ = self.prune_old_checkpoints();

        Ok(cp)
    }

    /// Liste tous les checkpoints triés par ordre chronologique décroissant
    pub fn list_checkpoints(&self) -> Result<Vec<Checkpoint>, CheckpointError> {
        let mut checkpoints = Vec::new();
        if !self.checkpoints_dir.exists() {
            return Ok(checkpoints);
        }

        for entry in fs::read_dir(&self.checkpoints_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    if Self::validate_checkpoint_id(dir_name).is_err() {
                        continue;
                    }
                } else {
                    continue;
                }

                let meta_file = path.join("metadata.json");
                if meta_file.exists() {
                    if let Ok(content) = fs::read_to_string(&meta_file) {
                        if let Ok(cp) = serde_json::from_str::<Checkpoint>(&content) {
                            checkpoints.push(cp);
                        }
                    }
                }
            }
        }

        checkpoints.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(checkpoints)
    }

    /// Restaure les fichiers du checkpoint sélectionné avec rollback différentiel :
    /// supprime les fichiers orphelins créés après l'horodatage du checkpoint.
    pub fn restore_checkpoint(&self, checkpoint_id: &str) -> Result<(), CheckpointError> {
        Self::validate_checkpoint_id(checkpoint_id)?;
        let cp_dir = self.checkpoints_dir.join(checkpoint_id);
        if !cp_dir.exists() {
            return Err(CheckpointError::NotFound(checkpoint_id.to_string()));
        }

        let meta_file = cp_dir.join("metadata.json");
        let checkpoint_timestamp: DateTime<Utc> = if meta_file.exists() {
            if let Ok(content) = fs::read_to_string(&meta_file) {
                serde_json::from_str::<Checkpoint>(&content)
                    .map(|cp| cp.timestamp)
                    .unwrap_or_else(|_| {
                        fs::metadata(&cp_dir)
                            .and_then(|m| m.modified())
                            .map(DateTime::<Utc>::from)
                            .unwrap_or_else(|_| Utc::now())
                    })
            } else {
                fs::metadata(&cp_dir)
                    .and_then(|m| m.modified())
                    .map(DateTime::<Utc>::from)
                    .unwrap_or_else(|_| Utc::now())
            }
        } else {
            fs::metadata(&cp_dir)
                .and_then(|m| m.modified())
                .map(DateTime::<Utc>::from)
                .unwrap_or_else(|_| Utc::now())
        };

        // 1. Rollback différentiel : identifier et supprimer les fichiers orphelins créés après le checkpoint
        for entry in WalkDir::new(&self.workspace_root)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                if e.file_type().is_dir() {
                    !is_excluded_dir_name(&name)
                } else {
                    !is_excluded_media_or_archive(e.path())
                }
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            if path == self.workspace_root {
                continue;
            }

            if entry.file_type().is_file() {
                if is_excluded_media_or_archive(path) || is_file_too_large(path) {
                    continue;
                }

                let rel_path = match path.strip_prefix(&self.workspace_root) {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                let in_checkpoint = cp_dir.join(rel_path).exists();
                if !in_checkpoint {
                    if let Ok(meta) = entry.metadata() {
                        let created_after = meta
                            .created()
                            .ok()
                            .map(|t| DateTime::<Utc>::from(t) >= checkpoint_timestamp)
                            .unwrap_or(false);
                        let modified_after = meta
                            .modified()
                            .ok()
                            .map(|t| DateTime::<Utc>::from(t) >= checkpoint_timestamp)
                            .unwrap_or(false);

                        if created_after || modified_after || (meta.created().is_err() && meta.modified().is_err()) {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }
        }

        // Nettoyer les répertoires orphelins vides créés après le checkpoint (parcours ascendant)
        for entry in WalkDir::new(&self.workspace_root)
            .contents_first(true)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                !is_excluded_dir_name(&name)
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if entry.file_type().is_dir() && entry.path() != self.workspace_root {
                if let Ok(rel) = entry.path().strip_prefix(&self.workspace_root) {
                    if !cp_dir.join(rel).exists() {
                        if fs::read_dir(entry.path()).map(|mut it| it.next().is_none()).unwrap_or(false) {
                            let _ = fs::remove_dir(entry.path());
                        }
                    }
                }
            }
        }

        // 2. Restaurer les fichiers du checkpoint sélectionné
        for entry in WalkDir::new(&cp_dir) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            if path == cp_dir {
                continue;
            }

            let rel_path = match path.strip_prefix(&cp_dir) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if rel_path.to_string_lossy() == "metadata.json" {
                continue;
            }

            let dest_path = match self.confinement.resolve_and_verify(rel_path) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!(
                        "Avertissement: chemin ignoré lors de la restauration: {:?} ({})",
                        rel_path, e
                    );
                    continue;
                }
            };

            if entry.file_type().is_dir() {
                fs::create_dir_all(&dest_path)?;
            } else if entry.file_type().is_file() {
                if let Some(parent) = dest_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(path, &dest_path)?;
            }
        }

        Ok(())
    }

    /// Restaure UN fichier spécifique depuis le checkpoint (Item 20)
    pub fn restore_file_from_checkpoint(
        &self,
        checkpoint_id: &str,
        rel_path: &str,
    ) -> Result<(), CheckpointError> {
        Self::validate_checkpoint_id(checkpoint_id)?;
        let cp_dir = self.checkpoints_dir.join(checkpoint_id);
        if !cp_dir.exists() {
            return Err(CheckpointError::NotFound(checkpoint_id.to_string()));
        }

        let clean_input = rel_path.trim_start_matches('/');
        let verified_dest = self.confinement.resolve_and_verify(clean_input)?;
        let clean_rel = verified_dest
            .strip_prefix(self.confinement.workspace_root())
            .map_err(|e| CheckpointError::SecurityError(e.to_string()))?;

        let src_file = cp_dir.join(clean_rel);
        if !src_file.exists() {
            return Err(CheckpointError::NotFound(format!(
                "Fichier '{}' non trouvé dans le checkpoint",
                rel_path
            )));
        }

        // Vérification de confinement côté checkpoint
        let canonical_cp = fs::canonicalize(&cp_dir)?;
        let canonical_src = fs::canonicalize(&src_file)?;
        if !canonical_src.starts_with(&canonical_cp) {
            return Err(CheckpointError::SecurityError(format!(
                "Tentative d'évasion détectée dans le checkpoint pour '{}'",
                rel_path
            )));
        }

        if let Some(parent) = verified_dest.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::copy(&src_file, &verified_dest)?;
        Ok(())
    }

    /// Supprime un checkpoint par son identifiant après validation UUID
    pub fn delete_checkpoint(&self, checkpoint_id: &str) -> Result<(), CheckpointError> {
        Self::validate_checkpoint_id(checkpoint_id)?;
        let cp_dir = self.checkpoints_dir.join(checkpoint_id);
        if !cp_dir.exists() {
            return Err(CheckpointError::NotFound(checkpoint_id.to_string()));
        }
        fs::remove_dir_all(cp_dir)?;
        Ok(())
    }

    /// Récupère les métadonnées d'un checkpoint par son identifiant après validation UUID
    pub fn get_checkpoint(&self, checkpoint_id: &str) -> Result<Checkpoint, CheckpointError> {
        Self::validate_checkpoint_id(checkpoint_id)?;
        let cp_dir = self.checkpoints_dir.join(checkpoint_id);
        if !cp_dir.exists() {
            return Err(CheckpointError::NotFound(checkpoint_id.to_string()));
        }
        let meta_file = cp_dir.join("metadata.json");
        if !meta_file.exists() {
            return Err(CheckpointError::NotFound(format!(
                "Métadonnées introuvables pour le checkpoint '{}'",
                checkpoint_id
            )));
        }
        let content = fs::read_to_string(meta_file)?;
        let cp = serde_json::from_str(&content).map_err(|e| {
            CheckpointError::Io(std::io::Error::new(std::io::ErrorKind::Other, e))
        })?;
        Ok(cp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_validate_checkpoint_id() {
        assert!(CheckpointManager::validate_checkpoint_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(CheckpointManager::validate_checkpoint_id("invalid-uuid").is_err());
        assert!(CheckpointManager::validate_checkpoint_id("../traversal").is_err());
    }

    #[test]
    fn test_hard_quota_prune_old_checkpoints() {
        let dir = tempdir().unwrap();
        let ws = dir.path();
        File::create(ws.join("test.txt")).unwrap().write_all(b"hello").unwrap();

        let mgr = CheckpointManager::new(ws).unwrap();

        // Créer 25 checkpoints
        for i in 0..25 {
            mgr.create_checkpoint(&format!("cp {}", i)).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let list = mgr.list_checkpoints().unwrap();
        assert_eq!(list.len(), MAX_CHECKPOINTS);
        assert_eq!(list.len(), 20);
        // Le checkpoint le plus récent est "cp 24"
        assert_eq!(list[0].description, "cp 24");
        // Le plus ancien conservé est "cp 5" (0 à 4 ont été élagués)
        assert_eq!(list[19].description, "cp 5");
    }

    #[test]
    fn test_exclusions() {
        let dir = tempdir().unwrap();
        let ws = dir.path();

        // Fichier normal
        File::create(ws.join("main.rs")).unwrap().write_all(b"fn main() {}").unwrap();

        // Répertoires exclus
        for d in &[".git", "node_modules", "target", ".venv", "dist", "build", ".gemini"] {
            let sub = ws.join(d);
            fs::create_dir_all(&sub).unwrap();
            File::create(sub.join("file.txt")).unwrap().write_all(b"content").unwrap();
        }

        // Fichiers médias et archives exclus
        File::create(ws.join("image.png")).unwrap().write_all(b"png data").unwrap();
        File::create(ws.join("video.mp4")).unwrap().write_all(b"mp4 data").unwrap();
        File::create(ws.join("archive.tar.gz")).unwrap().write_all(b"tar gz data").unwrap();
        File::create(ws.join("archive.zip")).unwrap().write_all(b"zip data").unwrap();

        let mgr = CheckpointManager::new(ws).unwrap();
        let cp = mgr.create_checkpoint("exclusions test").unwrap();
        let cp_dir = mgr.checkpoints_dir.join(&cp.id);

        assert!(cp_dir.join("main.rs").exists());
        assert!(!cp_dir.join(".git").exists());
        assert!(!cp_dir.join("node_modules").exists());
        assert!(!cp_dir.join("target").exists());
        assert!(!cp_dir.join(".venv").exists());
        assert!(!cp_dir.join("dist").exists());
        assert!(!cp_dir.join("build").exists());
        assert!(!cp_dir.join(".gemini").exists());
        assert!(!cp_dir.join("image.png").exists());
        assert!(!cp_dir.join("video.mp4").exists());
        assert!(!cp_dir.join("archive.tar.gz").exists());
        assert!(!cp_dir.join("archive.zip").exists());
    }

    #[test]
    fn test_path_confinement_security() {
        let dir = tempdir().unwrap();
        let ws = dir.path();
        File::create(ws.join("normal.txt")).unwrap().write_all(b"ok").unwrap();

        let mgr = CheckpointManager::new(ws).unwrap();
        let cp = mgr.create_checkpoint("sec test").unwrap();

        // Tentative de path traversal avec restore_file_from_checkpoint
        let res_traversal = mgr.restore_file_from_checkpoint(&cp.id, "../../etc/passwd");
        assert!(res_traversal.is_err());

        let res_invalid_id = mgr.restore_file_from_checkpoint("invalid-uuid", "normal.txt");
        assert!(res_invalid_id.is_err());
    }

    #[test]
    fn test_differential_rollback_cleans_orphan_files() {
        let dir = tempdir().unwrap();
        let ws = dir.path();
        let f1 = ws.join("existing.txt");
        File::create(&f1).unwrap().write_all(b"version 1").unwrap();

        let mgr = CheckpointManager::new(ws).unwrap();
        let cp = mgr.create_checkpoint("initial").unwrap();

        std::thread::sleep(std::time::Duration::from_millis(50));

        // Modifier le fichier existant
        fs::write(&f1, b"version 2 modified").unwrap();

        // Créer de nouveaux fichiers orphelins et répertoires
        let sub = ws.join("subfolder");
        fs::create_dir_all(&sub).unwrap();
        let orphan_file = sub.join("orphan.txt");
        fs::write(&orphan_file, b"i am an orphan").unwrap();

        let root_orphan = ws.join("root_orphan.txt");
        fs::write(&root_orphan, b"orphan in root").unwrap();

        // Effectuer le rollback
        mgr.restore_checkpoint(&cp.id).unwrap();

        // Vérifier que le fichier existant a été restauré
        assert_eq!(fs::read_to_string(&f1).unwrap(), "version 1");

        // Vérifier que les fichiers orphelins ont été supprimés
        assert!(!orphan_file.exists());
        assert!(!root_orphan.exists());
        // Vérifier que le répertoire orphelin vide a été nettoyé
        assert!(!sub.exists());
    }
}
