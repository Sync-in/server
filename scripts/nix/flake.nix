{
  description = "Sync-in NixOS module + package";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  };

  outputs = {
    self,
    nixpkgs,
    ...
  }: let
    systems = ["x86_64-linux"];
    forAllSystems = f:
      nixpkgs.lib.genAttrs systems (
        system:
          f (import nixpkgs {inherit system;})
      );
  in {
    packages = forAllSystems (pkgs: {
      sync-in = pkgs.callPackage ./package.nix {};
      # default = pkgs.sync-in;
    });

    nixosModules.sync-in = import ./module.nix;

    # packages.x86_64-linux.default = self.packages.x86_64-linux.sync-in;

    # nixosConfigurations.example = nixpkgs.lib.nixosSystem {
    #   inherit system;
    #   modules = [
    #     self.nixosModules.sync-in
    #     {
    #       services.sync-in = {
    #         enable = true;
    #         package = self.packages.${system}.sync-in;

    #         admin.passwordFile = "/run/secrets/admin";
    #         database.passwordFile = "/run/secrets/db";
    #       };
    #     }
    #   ];
    # };
  };
}
