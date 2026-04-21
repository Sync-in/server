{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.sync-in;
  yaml = pkgs.formats.yaml {};
  drizzleJsFile = ./drizzle.js;
in {
  options.services.sync-in = {
    enable = lib.mkEnableOption "Sync-in";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix {};
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "sync-in";
      description = "User to run sync-in service";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "sync-in";
      description = "Group to run sync-in service";
    };

    server = {
      host = lib.mkOption {
        type = lib.types.str;
        default = "0.0.0.0";
      };
      port = lib.mkOption {
        type = lib.types.int;
        default = 8080;
      };
      workers = lib.mkOption {
        type = lib.types.int;
        default = 1;
      };
      trustProxy = lib.mkOption {
        type = lib.types.str;
        default = "1";
      };
      restartOnFailure = lib.mkOption {
        type = lib.types.bool;
        default = true;
      };
      publicUrl = lib.mkOption {
        type = lib.types.str;
        default = "http://localhost:8080";
      };
    };
    logger = {
      level = lib.mkOption {
        type = lib.types.enum ["trace" "debug" "info" "warn" "error" "fatal"];
        default = "info";
      };
      stdout = lib.mkOption {
        type = lib.types.bool;
        default = true;
      };
      colorize = lib.mkOption {
        type = lib.types.bool;
        default = true;
      };
      jsonOutput = lib.mkOption {
        type = lib.types.bool;
        default = true;
      };
      filePath = lib.mkOption {
        type = lib.types.str;
        default = "/var/lib/sync-in";
      };
    };
    mysql = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "syncin";
      };
      user = lib.mkOption {
        type = lib.types.str;
        default = "syncin";
      };
      passwordFile = lib.mkOption {
        type = lib.types.str;
        default = "/etc/sync-in/mysql.password";
      };
      password = lib.mkOption {
        type = lib.types.enum ["__DB_PASSWORD__"];
        default = "__DB_PASSWORD__";
      };

      host = lib.mkOption {
        type = lib.types.str;
        default = "localhost";
      };
      port = lib.mkOption {
        type = lib.types.int;
        default = 3306;
      };
      logQueries = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      cache = {
        adapter = lib.mkOption {
          type = lib.types.enum ["mysql" "redis"];
          default = "mysql";
        };
        ttl = lib.mkOption {
          type = lib.types.int;
          default = 60;
        };
        redis = lib.mkOption {
          type = lib.types.str;
          default = "redis://127.0.0.1:6379";
        };
      };
    };
    mail = {
      host = lib.mkOption {
        type = lib.types.nullOr (lib.types.str);
        default = null;
      };
      port = lib.mkOption {
        type = lib.types.int;
        default = 25;
      };
      sender = lib.mkOption {
        type = lib.types.nullOr (lib.types.str);
        default = null;
      };
      auth = {
        user = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        passFile = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = "/etc/sync-in/mail.password";
        };
        pass = lib.mkOption {
          type = lib.types.enum ["__MAIL_PASS__"];
          default = "__MAIL_PASS__";
        };
      };
      secure = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      ignoreTLS = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      rejectUnauthorized = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      logger = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
      debug = lib.mkOption {
        type = lib.types.bool;
        default = false;
      };
    };
    websocket = {
      adapter = lib.mkOption {
        type = lib.types.enum ["cluster" "url"];
        default = "cluster";
      };
      corsOrigine = lib.mkOption {
        type = lib.types.nullOr (lib.types.str);
        default = "*";
      };
      redis = lib.mkOption {
        type = lib.types.nullOr (lib.types.str);
        default = "redis://127.0.0.1:6379";
      };
    };
    auth = {
      provider = lib.mkOption {
        type = lib.types.enum ["mysql" "ldap" "oidc"];
        default = "mysql";
        description = "Authentication method mysql | ldap | oidc";
      };
      encryptionKey = lib.mkOption {
        type = lib.types.nullOr (lib.types.str);
        default = null;
        description = "Key used to encrypt user secret keys in the database";
      };
      cookieSameSite = lib.mkOption {
        type = lib.types.enum ["lax" "strict"];
        default = "strict";
        description = " `lax` | `strict`";
      };
      token = {
        access = {
          secretFile = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "/etc/sync-in/access.token";
            description = "Used for token and cookie signatures";
          };
          secret = lib.mkOption {
            type = lib.types.enum ["__ACCESS_TOKEN__"];
            default = "__ACCESS_TOKEN__";
          };
          expiration = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "30m";
          };
        };
        refresh = {
          secret = lib.mkOption {
            type = lib.types.enum ["__REFRESH_TOKEN__"];
            default = "__REFRESH_TOKEN__";
          };
          secretFile = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "/etc/sync-in/refresh.token";
            description = "Used for token and cookie signatures";
          };
          expiration = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "30m";
          };
        };
      };
      mfa = {
        enabled = lib.mkOption {
          type = lib.types.bool;
          default = true;
        };
        issuer = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = "Sync-in";
        };
      };

      ldap = {
        servers = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [];
        };
        tlsOptions = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        baseDN = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        filter = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        upnSuffix = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        netbiosName = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        serverBindDN = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        serverBindPasswordFile = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = "/etc/sync-in/ldap.secret";
        };
        serverBindPassword = lib.mkOption {
          type = lib.types.enum ["__LDAP_PASSWORD__"];
          default = "__LDAP_PASSWORD__";
        };
        attributes = {
          login = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "uid";
          };
          email = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "mail";
          };
        };
        options = {
          autoCreateUser = lib.mkOption {
            type = lib.types.bool;
            default = false;
          };
          autoCreatePermissions = lib.mkOption {
            type = lib.types.listOf lib.types.str;
            default = [];
            description = "https://sync-in.com/docs/admin-guide/permissions";
          };
          adminGroup = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = null;
          };
          enablePaswordAuthFallback = lib.mkOption {
            type = lib.types.bool;
            default = true;
          };
        };
      };
      oidc = {
        issuerUrl = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        clientId = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        clientSecretFile = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = "/etc/sync-in/oidc.secret";
        };
        clientSecret = lib.mkOption {
          type = lib.types.enum ["__OIDC_PASSWORD__"];
          default = "__OIDC_PASSWORD__";
        };
        redirectUri = lib.mkOption {
          type = lib.types.nullOr (lib.types.str);
          default = null;
        };
        options = {
          autoCreateUser = lib.mkOption {
            type = lib.types.bool;
            default = true;
          };
          autoCreatePermissions = lib.mkOption {
            type = lib.types.listOf lib.types.str;
            default = ["personal_space" "spaces_access" "webdav_access"];
          };
          adminRoleOrGroup = lib.mkOption {
            type = lib.types.str;
            default = "admin";
          };
          enablePasswordAuth = lib.mkOption {
            type = lib.types.bool;
            default = true;
          };
          autoRedirect = lib.mkOption {
            type = lib.types.bool;
            default = false;
          };
          buttonText = lib.mkOption {
            type = lib.types.str;
            default = "Continue with OpenID Connect";
          };
        };
        security = {
          scope = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "openid email profile";
          };
          supportPKCE = lib.mkOption {
            type = lib.types.bool;
            default = true;
          };
          tokenEndpointAuthMethod = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "client_secret_basic";
          };
          tokenSigningAlg = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = "RS256";
          };
          userInfoSigningAlg = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = null;
          };
          skipSubjectCheck = lib.mkOption {
            type = lib.types.bool;
            default = false;
          };
        };
      };
    };
    applications = {
      files = {
        dataPath = lib.mkOption {
          type = lib.types.str;
          default = "/var/lib/sync-in";
        };
        maxUploadSize = lib.mkOption {
          type = lib.types.int;
          default = 5368709120;
        };
        contentIndexing = {
          enabled = lib.mkOption {
            type = lib.types.bool;
            default = true;
          };
          ocr = {
            enabled = lib.mkOption {
              type = lib.types.bool;
              default = true;
            };
            languages = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              default = ["eng"];
            };
            languagesPath = lib.mkOption {
              type = lib.types.nullOr (lib.types.str);
              default = null;
            };
            offline = lib.mkOption {
              type = lib.types.bool;
              default = true;
            };
          };
        };

        showHiddenFiles = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };

        onlyoffice = {
          enabled = lib.mkOption {
            type = lib.types.bool;
            default = false;
          };
          externalServer = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = null;
          };
          secret = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = null;
          };
          verifySSL = lib.mkOption {
            type = lib.types.bool;
            default = false;
          };
        };
        collabora = {
          enabled = lib.mkOption {
            type = lib.types.bool;
            default = false;
          };
          externalServer = lib.mkOption {
            type = lib.types.nullOr (lib.types.str);
            default = null;
          };
        };
      };
      appStore.repository = lib.mkOption {
        type = lib.types.enum ["public" "local"];
        default = "public";
      };
    };

    admin = {
      login = lib.mkOption {
        type = lib.types.str;
        default = "admin";
      };

      passwordFile = lib.mkOption {
        type = lib.types.str;
        default = "/etc/sync-in/admin.password";
      };
    };

    extraSettings = lib.mkOption {
      type = lib.types.attrs;
      default = {};
    };
  };

  config = lib.mkIf cfg.enable (
    let
      configFile = yaml.generate "environment.yaml" (
        lib.recursiveUpdate
        {
          server = cfg.server;
          logger = cfg.logger;
          mysql = {
            url = "mysql://${cfg.mysql.user}:__DB_PASSWORD__@${cfg.mysql.host}:${builtins.toString cfg.mysql.port}/${cfg.mysql.name}";
            logQueries = cfg.mysql.logQueries;
            cache = cfg.mysql.cache;
          };
          websocket = cfg.websocket;
          mail = cfg.mail;
          auth = cfg.auth;
          applications = cfg.applications;
        }
        cfg.extraSettings
      );
    in {
      services.mysql.enable = true;
      # services.redis.servers."syncin" = {
      #   enable = lib.mkIf (cfg.) true ;
      #   port = cfg.redis.port;
      #   bind = cfg.redis.host;
      # };

      systemd.tmpfiles.rules = [
        "d /etc/sync-in 0750 ${cfg.user} ${cfg.group}"
        "f ${cfg.mysql.passwordFile} 0600 ${cfg.user} ${cfg.group}"
        "f ${cfg.admin.passwordFile} 0600 ${cfg.user} ${cfg.group}"
        "f ${cfg.mail.auth.passFile} 0600 ${cfg.user} ${cfg.group}"
        "f ${cfg.auth.ldap.serverBindPasswordFile} 0600 ${cfg.user} ${cfg.group}"
        "f ${cfg.auth.token.access.secretFile} 0600 ${cfg.user} ${cfg.group}"
        "f ${cfg.auth.token.refresh.secretFile} 0600 ${cfg.user} ${cfg.group}"
        "f ${cfg.auth.oidc.clientSecretFile} 0600 ${cfg.user} ${cfg.group}"
      ];

      # environment.etc.sync-in = {

      # };

      # users.users.sync-in = {
      #   isSystemUser = true;
      #   home = cfg.applications.files.dataPath;
      #   createHome = true;
      #   group = cfg.group;
      # };

      # users.users."${cfg.user}" = {
      #   isSystemUser = true;
      #   # home = cfg.applications.files.dataPath;
      #   # createHome = true;
      #   group = cfg.group;
      # };

      # users.groups."${cfg.group}" = {};

      systemd.services.sync-in = {
        description = "Sync-in";
        wantedBy = ["multi-user.target"];
        after = ["network.target" "mysql.service"];
        # after = ["network.target" "mysql.service" "redis.service"];

        preStart = ''
          set -e
          cd ${cfg.applications.files.dataPath}

          DB_PASS=$(cat ${cfg.mysql.passwordFile})
          DB_USER=${cfg.mysql.user}
          DB_NAME=${cfg.mysql.name}
          DB_HOST=${cfg.mysql.host}
          DB_PORT=${builtins.toString cfg.mysql.port}
          DB_USER=${cfg.mysql.user}
          ADMIN_PASS=$(cat ${cfg.admin.passwordFile})
          MAIL_PASS=$(cat ${cfg.mail.auth.passFile})
          LDAP_PASS=$(cat ${cfg.auth.ldap.serverBindPasswordFile})
          OIDC_PASS=$(cat ${cfg.auth.oidc.clientSecretFile})
          ACCESS_TOKEN=$(cat ${cfg.auth.token.access.secretFile})
          REFRESH_TOKEN=$(cat ${cfg.auth.token.refresh.secretFile})

          # if [ -n "${builtins.toString cfg.auth.ldap.serverBindPasswordFile or ""}" ]; then
          #   LDAP_PASS=$(cat ${builtins.toString cfg.auth.ldap.serverBindPasswordFile})
          # fi

          cp ${configFile} ${cfg.applications.files.dataPath}/environment.yaml
          chmod ug+w ${cfg.applications.files.dataPath}/environment.yaml

          # substituteInPlace environment.yaml \
          #   --replace "__DB_PASSWORD__" "$DB_PASS" \
          #   --replace "__LDAP_PASSWORD__" "$LDAP_PASS"

          sed -i "s|__DB_PASSWORD__|$DB_PASS|g" ${cfg.applications.files.dataPath}/environment.yaml
          sed -i "s|__LDAP_PASSWORD__|$LDAP_PASS|g" ${cfg.applications.files.dataPath}/environment.yaml

          sed -i "s|__MAIL_PASS__|$MAIL_PASS|g" ${cfg.applications.files.dataPath}/environment.yaml
          sed -i "s|__LDAP_PASSWORD__|$LDAP_PASS|g" ${cfg.applications.files.dataPath}/environment.yaml
          sed -i "s|__OIDC_PASSWORD__|$OIDC_PASS|g" ${cfg.applications.files.dataPath}/environment.yaml
          sed -i "s|__ACCESS_TOKEN__|$ACCESS_TOKEN|g" ${cfg.applications.files.dataPath}/environment.yaml
          sed -i "s|__REFRESH_TOKEN__|$REFRESH_TOKEN|g" ${cfg.applications.files.dataPath}/environment.yaml
          sed -i -E '/ecretFile:|asswordFile:|assFile:|: null$/d' ${cfg.applications.files.dataPath}/environment.yaml

          cp ${drizzleJsFile} ${cfg.applications.files.dataPath}/drizzle.js
          chown ${cfg.user}:${cfg.group} ${cfg.applications.files.dataPath}/drizzle.js

          sed -i "s|\./release/sync-in-server/server/|${cfg.package}/lib/release/sync-in-server/server/|g" ${cfg.applications.files.dataPath}/drizzle.js
          sed -i "s|__PASSWORD__|$DB_PASS|g" ${cfg.applications.files.dataPath}/drizzle.js
          sed -i "s|__USER__|$DB_USER|g" ${cfg.applications.files.dataPath}/drizzle.js
          sed -i "s|__HOST__|$DB_HOST|g" ${cfg.applications.files.dataPath}/drizzle.js
          sed -i "s|__PORT__|$DB_PORT|g" ${cfg.applications.files.dataPath}/drizzle.js
          sed -i "s|__NAME__|$DB_NAME|g" ${cfg.applications.files.dataPath}/drizzle.js


          if [ ! -f .initialized ]; then
            ${cfg.package}/bin/sync-in init
            touch .initialized
          fi

          ${pkgs.mariadb}/bin/mariadb <<EOF
          CREATE DATABASE IF NOT EXISTS ${cfg.mysql.name};
          CREATE USER IF NOT EXISTS '${cfg.mysql.user}'@'${cfg.mysql.host}' IDENTIFIED BY '$DB_PASS';
          GRANT ALL PRIVILEGES ON ${cfg.mysql.name}.* TO '${cfg.mysql.user}'@'${cfg.mysql.host}';
          FLUSH PRIVILEGES;
          EOF

          sed "s|/etc/sync-in/drizzle.js|${cfg.applications.files.dataPath}/drizzle.js|g" ${cfg.package}/bin/sync-in-migrate-db >  ${cfg.applications.files.dataPath}/sync-in-migrate-db
          chown ug+x sync-in-migrate-db

          ${cfg.applications.files.dataPath}/sync-in-migrate-db

          if [ ! -f .admin_created ]; then
            ${cfg.package}/bin/sync-in create-user \
              --role admin \
              --login "${cfg.admin.login}" \
              --password "$ADMIN_PASS"

            touch .admin_created
          fi
        '';

        serviceConfig = {
          ExecStart = "${pkgs.nodejs_24}/bin/node ${cfg.package}/lib/release/sync-in-server/sync-in-server.js start";
          # ExecStart = "${cfg.package}/bin/sync-in-start";
          Restart = "always";
          User = "${cfg.user}";
          Group = "${cfg.group}";
          Environment = "NODE_PATH=${pkgs.nodejs_24}/lib/node_modules:${cfg.package}/lib/node_modules";
          WorkingDirectory = cfg.applications.files.dataPath;
        };
      };
    }
  );
}
