ALTER TABLE `cache`
  MODIFY COLUMN `key` varchar(8192) CHARACTER SET utf8mb4 COLLATE utf8mb4_nopad_bin NOT NULL,
  ADD COLUMN IF NOT EXISTS `key_hash` binary(32) GENERATED ALWAYS AS (unhex(sha2(`key`, 256))) STORED,
  ADD UNIQUE KEY IF NOT EXISTS `cache_key_hash_unique` (`key_hash`) USING BTREE,
  DROP INDEX IF EXISTS `cache_key_unique`;
