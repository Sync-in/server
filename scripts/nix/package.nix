{pkgs ? import <nixpkgs> {}}: let
  drizzleJsFile = ./drizzle.js;
in
  pkgs.buildNpmPackage {
    pname = "sync-in";
    version = "2.2.0-a4";

    src = pkgs.fetchFromGitHub {
      owner = "Sync-in";
      repo = "server";
      rev = "v2.2.0";
      hash = "sha256-PkdVveWfAqEU/Ljs28OZt1QPjE+DqQX4Aet/wCk7eok=";
    };

    nativeBuildInputs = [pkgs.nodejs_24];

    postPatch = ''
      ${pkgs.nodejs_24}/bin/npm pkg set dependencies.drizzle-orm="^0.45.2"
      ${pkgs.nodejs_24}/bin/npm pkg set dependencies.pdfjs-dist="^5.6.205"
      ${pkgs.nodejs_24}/bin/npm pkg set dependencies.drizzle-kit="^v0.31.10"
    '';

    # npmInstallFlags = "";

    npmDepsHash = "sha256-sOmR+cwIllv9V3JdqLlZnImsgntjS7ahDKXzyxKOS1M=";

    buildPhase = ''
      runHook preBuild
      # ${pkgs.nodejs_24}/bin/npm run build
      ${pkgs.nodejs_24}/bin/npm run build && ${pkgs.nodejs_24}/bin/node scripts/build/release.mjs


      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out/lib
      cp -r . $out/lib

      mkdir -p $out/bin
      mkdir -p $out/conf
      cp ${drizzleJsFile} $out/conf/drizzle.js

      # cat > $out/conf/drizzle.js <<EOF
      # import { defineConfig } from "drizzle-kit";

      # export default defineConfig({
      #   dialect: "mysql",
      #   schema: "./release/sync-in-server/server/infrastructure/database/schema.js",
      #   out: "./backend/migrations",
      #   url: "mysql://root@localhost/syncin",
      #   tablesFilter: [
      #     'files_content_*'
      #   ]
      # });
      # EOF

      cat > $out/bin/sync-in <<EOF
      #!${pkgs.runtimeShell}
      export NODE_PATH=$NODE_PATH:$out/lib/node_modules
      exec ${pkgs.nodejs_24}/bin/node $out/lib/release/sync-in-server/server/main.js "\$@"
      EOF

      cat > $out/bin/sync-in-migrate-db <<EOF
      #!${pkgs.runtimeShell}
      export NODE_PATH=$NODE_PATH:$out/lib/node_modules
      exec ${pkgs.nodejs_24}/bin/npx drizzle-kit migrate --config=/etc/sync-in/drizzle.js "\$@"
      EOF

      chmod +x $out/bin/sync-in
      chmod +x $out/bin/sync-in-*

      runHook postInstall
    '';

    meta = with pkgs.lib; {
      description = "Sync-in server (self-hosted collaboration platform)";
      license = licenses.agpl3Only;
      platforms = platforms.linux;
    };
  }
