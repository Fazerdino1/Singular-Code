#!/usr/bin/env python3
import os
import sys
import shutil
import tarfile
import subprocess
import gzip
import io

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    release_bin = os.path.join(root_dir, "src-tauri", "target", "release", "local-code-agent")
    
    if not os.path.exists(release_bin):
        print(f"Binaire non trouvé à {release_bin}, utilisation du debug binaire pour le packaging de test.")
        release_bin = os.path.join(root_dir, "src-tauri", "target", "debug", "local-code-agent")

    if not os.path.exists(release_bin):
        print(f"Erreur : Aucun binaire trouvé.")
        sys.exit(1)

    out_dir = os.path.join(root_dir, "dist-packages")
    os.makedirs(out_dir, exist_ok=True)

    print("=== CRÉATION DES PACKAGES LINUX DE PRODUCTION ===")

    # 1. Structure AppDir pour AppImage
    appdir = os.path.join(out_dir, "AppDir")
    if os.path.exists(appdir):
        shutil.rmtree(appdir)

    os.makedirs(os.path.join(appdir, "usr", "bin"), exist_ok=True)
    os.makedirs(os.path.join(appdir, "usr", "share", "applications"), exist_ok=True)
    os.makedirs(os.path.join(appdir, "usr", "share", "icons", "hicolor", "512x512", "apps"), exist_ok=True)

    # Copie du binaire
    target_bin = os.path.join(appdir, "usr", "bin", "local-code-agent")
    shutil.copy2(release_bin, target_bin)
    os.chmod(target_bin, 0o755)

    # Copie icônes
    src_icon = os.path.join(root_dir, "src-tauri", "icons", "icon.png")
    appdir_icon = os.path.join(appdir, "local-code-agent.png")
    hicolor_icon = os.path.join(appdir, "usr", "share", "icons", "hicolor", "512x512", "apps", "local-code-agent.png")
    shutil.copy2(src_icon, appdir_icon)
    shutil.copy2(src_icon, hicolor_icon)

    # Copie .desktop
    desktop_src = os.path.join(root_dir, "local-code-agent.desktop")
    shutil.copy2(desktop_src, os.path.join(appdir, "local-code-agent.desktop"))
    shutil.copy2(desktop_src, os.path.join(appdir, "usr", "share", "applications", "local-code-agent.desktop"))

    # AppRun script
    apprun_path = os.path.join(appdir, "AppRun")
    with open(apprun_path, "w") as f:
        f.write("""#!/bin/sh
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export GDK_BACKEND=x11,wayland
exec "${HERE}/usr/bin/local-code-agent" "$@"
""")
    os.chmod(apprun_path, 0o755)

    # Création de l'AppImage autonome (tar exécutable / portable)
    appimage_path = os.path.join(out_dir, "local-code-agent-0.1.0.AppImage")
    # Pour un environnement sans fuse/appimagetool direct, création d'une archive auto-extractible
    with open(appimage_path, "wb") as out_f:
        # Header script shell auto-extractible
        header = b"""#!/bin/sh
set -e
TMPDIR=$(mktemp -d /tmp/local-code-agent-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT
sed -e '1,/^#__PAYLOAD_BELOW__/d' "$0" | tar -xz -C "$TMPDIR"
exec "$TMPDIR/AppRun" "$@"
#__PAYLOAD_BELOW__\n"""
        out_f.write(header)
        # Création tar gz du payload
        tar_stream = io.BytesIO()
        with tarfile.open(fileobj=tar_stream, mode="w:gz") as tar:
            for item in os.listdir(appdir):
                item_path = os.path.join(appdir, item)
                tar.add(item_path, arcname=item)
        out_f.write(tar_stream.getvalue())

    os.chmod(appimage_path, 0o755)
    print(f"✓ AppImage généré avec succès : {appimage_path} ({os.path.getsize(appimage_path) / (1024*1024):.1f} Mo)")

    # 2. Création du package Debian (.deb)
    deb_dir = os.path.join(out_dir, "deb-build")
    if os.path.exists(deb_dir):
        shutil.rmtree(deb_dir)

    os.makedirs(os.path.join(deb_dir, "usr", "bin"), exist_ok=True)
    os.makedirs(os.path.join(deb_dir, "usr", "share", "applications"), exist_ok=True)
    os.makedirs(os.path.join(deb_dir, "usr", "share", "icons", "hicolor", "512x512", "apps"), exist_ok=True)
    os.makedirs(os.path.join(deb_dir, "DEBIAN"), exist_ok=True)

    shutil.copy2(release_bin, os.path.join(deb_dir, "usr", "bin", "local-code-agent"))
    os.chmod(os.path.join(deb_dir, "usr", "bin", "local-code-agent"), 0o755)
    shutil.copy2(desktop_src, os.path.join(deb_dir, "usr", "share", "applications", "local-code-agent.desktop"))
    shutil.copy2(src_icon, os.path.join(deb_dir, "usr", "share", "icons", "hicolor", "512x512", "apps", "local-code-agent.png"))

    # Fichier control Debian
    control_content = """Package: local-code-agent
Version: 0.1.0
Section: devel
Priority: optional
Architecture: amd64
Depends: libwebkit2gtk-4.1-0, libgtk-3-0, bubblewrap
Maintainer: Antigravity <agent@local>
Description: Agent de code local autonome et sécurisé pour Linux
 Agent IA open source fonctionnant avec Ollama, LM Studio et tout serveur OpenAI local avec confinement Bubblewrap strict.
"""
    with open(os.path.join(deb_dir, "DEBIAN", "control"), "w") as f:
        f.write(control_content)

    # Assembler le .deb (Format ar UNIX avec debian-binary, control.tar.gz, data.tar.gz)
    deb_pkg_path = os.path.join(out_dir, "local-code-agent_0.1.0_amd64.deb")

    def make_tar_gz(source_dir, prefix=""):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for root, dirs, files in os.walk(source_dir):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_p = os.path.relpath(full_p, source_dir)
                    arc_name = os.path.join(prefix, rel_p) if prefix else rel_p
                    tar.add(full_p, arcname=arc_name)
        return buf.getvalue()

    debian_binary = b"2.0\n"
    control_tar_gz = make_tar_gz(os.path.join(deb_dir, "DEBIAN"))
    
    # data.tar.gz sans le dossier DEBIAN
    data_buf = io.BytesIO()
    with tarfile.open(fileobj=data_buf, mode="w:gz") as tar:
        for folder in ["usr"]:
            full_folder = os.path.join(deb_dir, folder)
            tar.add(full_folder, arcname=folder)
    data_tar_gz = data_buf.getvalue()

    # Écriture archive AR
    def write_ar_entry(out, name, data):
        # Format AR standard 60 bytes
        name_field = f"{name:<16}".encode('ascii')
        mtime = f"{int(os.path.getmtime(release_bin)):<12}".encode('ascii')
        owner = b"0     "
        group = b"0     "
        mode = b"100644  "
        size = f"{len(data):<10}".encode('ascii')
        fmag = b"`\n"
        out.write(name_field + mtime + owner + group + mode + size + fmag)
        out.write(data)
        if len(data) % 2 != 0:
            out.write(b"\n")

    with open(deb_pkg_path, "wb") as deb_f:
        deb_f.write(b"!<arch>\n")
        write_ar_entry(deb_f, "debian-binary", debian_binary)
        write_ar_entry(deb_f, "control.tar.gz", control_tar_gz)
        write_ar_entry(deb_f, "data.tar.gz", data_tar_gz)

    print(f"✓ Paquet .deb généré avec succès : {deb_pkg_path} ({os.path.getsize(deb_pkg_path) / (1024*1024):.1f} Mo)")

    # 3. Création du package RPM (.rpm) via rpmbuild
    rpmbuild_dir = os.path.join(out_dir, "rpmbuild")
    for sub in ["BUILD", "RPMS", "SOURCES", "SPECS", "SRPMS"]:
        os.makedirs(os.path.join(rpmbuild_dir, sub), exist_ok=True)

    spec_file = os.path.join(rpmbuild_dir, "SPECS", "local-code-agent.spec")
    with open(spec_file, "w") as f:
        f.write(f"""Name:           local-code-agent
Version:        0.1.0
Release:        1%{{?dist}}
Summary:        Agent de code local autonome et sécurisé pour Linux
License:        MIT
Requires:       webkit2gtk4.1, gtk3, bubblewrap

%description
Agent de code local autonome et sécurisé pour Linux propulsé par des modèles d'IA locaux.

%install
mkdir -p %{{buildroot}}%{{_bindir}}
mkdir -p %{{buildroot}}%{{_datadir}}/applications
mkdir -p %{{buildroot}}%{{_datadir}}/icons/hicolor/512x512/apps
cp {release_bin} %{{buildroot}}%{{_bindir}}/local-code-agent
cp {desktop_src} %{{buildroot}}%{{_datadir}}/applications/local-code-agent.desktop
cp {src_icon} %{{buildroot}}%{{_datadir}}/icons/hicolor/512x512/apps/local-code-agent.png

%files
%{{_bindir}}/local-code-agent
%{{_datadir}}/applications/local-code-agent.desktop
%{{_datadir}}/icons/hicolor/512x512/apps/local-code-agent.png
""")

    subprocess.run([
        "rpmbuild",
        "--define", f"_topdir {rpmbuild_dir}",
        "--define", "_tmppath /tmp",
        "-bb", spec_file
    ], check=False)

    rpm_found = []
    for root, dirs, files in os.walk(os.path.join(rpmbuild_dir, "RPMS")):
        for f in files:
            if f.endswith(".rpm"):
                rpm_path = os.path.join(root, f)
                dest_rpm = os.path.join(out_dir, f)
                shutil.copy2(rpm_path, dest_rpm)
                rpm_found.append(dest_rpm)

    if rpm_found:
        print(f"✓ Paquet .rpm généré avec succès : {rpm_found[0]} ({os.path.getsize(rpm_found[0]) / (1024*1024):.1f} Mo)")

    print("\n=== TOUS LES PACKAGES DE PRODUCTION SONT CRÉÉS DANS dist-packages/ ===")

if __name__ == "__main__":
    main()
