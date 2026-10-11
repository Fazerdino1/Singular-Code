#!/usr/bin/env python3
import os
import shutil
import zipfile

def export():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dest_dir = os.path.join(root, "local-code-agent-clean")
    zip_path = os.path.join(root, "local-code-agent-essential.zip")

    print("=== CRÉATION DE LA COPIE PROPRE DU PROJET POUR L'IA ===")

    if os.path.exists(dest_dir):
        shutil.rmtree(dest_dir)
    os.makedirs(dest_dir, exist_ok=True)

    # 1. Copier les répertoires sources essentiels
    dirs_to_copy = [
        ("src", "src"),
        ("public", "public"),
        ("scripts", "scripts"),
        ("src-tauri/src", "src-tauri/src"),
        ("src-tauri/capabilities", "src-tauri/capabilities"),
        ("src-tauri/icons", "src-tauri/icons"),
        ("src-tauri/tests", "src-tauri/tests"),
    ]

    for src_rel, dst_rel in dirs_to_copy:
        src_path = os.path.join(root, src_rel)
        dst_path = os.path.join(dest_dir, dst_rel)
        if os.path.exists(src_path):
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copytree(src_path, dst_path)

    # 2. Copier les fichiers individuels essentiels
    files_to_copy = [
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "index.html",
        "local-code-agent.desktop",
        "README.md",
        "AGENT.md",
        ".gitignore",
        "src-tauri/build.rs",
        "src-tauri/Cargo.toml",
        "src-tauri/Cargo.lock",
        "src-tauri/tauri.conf.json",
    ]

    for f_rel in files_to_copy:
        src_file = os.path.join(root, f_rel)
        dst_file = os.path.join(dest_dir, f_rel)
        if os.path.exists(src_file):
            os.makedirs(os.path.dirname(dst_file), exist_ok=True)
            shutil.copy2(src_file, dst_file)

    print(f"✓ Copie propre créée dans : {dest_dir}")

    # 3. Création de l'archive ZIP
    if os.path.exists(zip_path):
        os.remove(zip_path)

    print("Archivage ZIP en cours...")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for foldername, subfolders, filenames in os.walk(dest_dir):
            for filename in filenames:
                filepath = os.path.join(foldername, filename)
                arcname = os.path.relpath(filepath, dest_dir)
                zipf.write(filepath, arcname)

    zip_size_bytes = os.path.getsize(zip_path)
    zip_size_mb = zip_size_bytes / (1024 * 1024)

    # Calculer la taille totale du dossier propre
    total_clean_bytes = 0
    for dirpath, dirnames, filenames in os.walk(dest_dir):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total_clean_bytes += os.path.getsize(fp)
    clean_size_mb = total_clean_bytes / (1024 * 1024)

    print(f"✓ Archive ZIP générée avec succès : {zip_path}")
    print(f"  - Taille du dossier source propre : {clean_size_mb:.2f} Mo")
    print(f"  - Taille de l'archive compressée ZIP : {zip_size_mb:.2f} Mo")

if __name__ == "__main__":
    export()
