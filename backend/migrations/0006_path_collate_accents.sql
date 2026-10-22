-- Convert both the table defaults and all existing character columns.
ALTER TABLE `spaces` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci;
--> statement-breakpoint
ALTER TABLE `spaces_roots` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci;
--> statement-breakpoint
ALTER TABLE `shares` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci;
--> statement-breakpoint
ALTER TABLE `files` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci;
--> statement-breakpoint
ALTER TABLE `files_recents` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci;
--> statement-breakpoint
-- Cache values are JSON and must keep their binary collation.
-- MariaDB uses its long UNIQUE hash index for full-key uniqueness; the prefix index supports lookups.
ALTER TABLE `cache`
  DROP PRIMARY KEY,
  MODIFY COLUMN `key` varchar(8192) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci NOT NULL,
  ADD UNIQUE KEY `cache_key_unique` (`key`),
  ADD KEY `cache_key_prefix_idx` (`key`(768));
--> statement-breakpoint
-- Trash tables are created at runtime and are not part of the Drizzle snapshot.
BEGIN NOT ATOMIC
  DECLARE migration_done BOOLEAN DEFAULT FALSE;
  DECLARE trash_table_name VARCHAR(64);
  DECLARE trash_schema_name VARCHAR(64);
  DECLARE trash_tables CURSOR FOR
    SELECT columns_info.TABLE_NAME
    FROM information_schema.COLUMNS AS columns_info
    INNER JOIN information_schema.TABLES AS tables_info
      ON tables_info.TABLE_SCHEMA = columns_info.TABLE_SCHEMA
      AND tables_info.TABLE_NAME = columns_info.TABLE_NAME
    WHERE columns_info.TABLE_SCHEMA = DATABASE()
      AND tables_info.TABLE_TYPE = 'BASE TABLE'
      AND BINARY LEFT(columns_info.TABLE_NAME, 12) = 'files_trash_'
      AND columns_info.COLUMN_NAME = 'path'
      AND (
        tables_info.TABLE_COLLATION <> 'utf8mb4_uca1400_nopad_as_ci'
        OR EXISTS (
          SELECT 1
          FROM information_schema.COLUMNS AS trash_columns
          WHERE trash_columns.TABLE_SCHEMA = columns_info.TABLE_SCHEMA
            AND trash_columns.TABLE_NAME = columns_info.TABLE_NAME
            AND trash_columns.COLLATION_NAME <> 'utf8mb4_uca1400_nopad_as_ci'
        )
      )
    ORDER BY columns_info.TABLE_NAME;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET migration_done = TRUE;

  SET trash_schema_name = DATABASE();
  OPEN trash_tables;
  migrate_trash_tables: LOOP
    FETCH trash_tables INTO trash_table_name;
    IF migration_done THEN
      LEAVE migrate_trash_tables;
    END IF;

    EXECUTE IMMEDIATE CONCAT(
      'ALTER TABLE `', REPLACE(trash_schema_name, '`', '``'), '`.`',
      REPLACE(trash_table_name, '`', '``'),
      '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci'
    );
  END LOOP;
  CLOSE trash_tables;
END;
--> statement-breakpoint
-- Preserve the content collation and FULLTEXT search behavior of runtime indexes.
BEGIN NOT ATOMIC
  DECLARE migration_done BOOLEAN DEFAULT FALSE;
  DECLARE content_table_name VARCHAR(64);
  DECLARE content_schema_name VARCHAR(64);
  DECLARE content_tables CURSOR FOR
    SELECT DISTINCT columns_info.TABLE_NAME
    FROM information_schema.COLUMNS AS columns_info
    INNER JOIN information_schema.TABLES AS tables_info
      ON tables_info.TABLE_SCHEMA = columns_info.TABLE_SCHEMA
      AND tables_info.TABLE_NAME = columns_info.TABLE_NAME
    WHERE columns_info.TABLE_SCHEMA = DATABASE()
      AND tables_info.TABLE_TYPE = 'BASE TABLE'
      AND BINARY LEFT(columns_info.TABLE_NAME, 14) = 'files_content_'
      AND columns_info.COLUMN_NAME IN ('path', 'name')
      AND columns_info.COLLATION_NAME <> 'utf8mb4_uca1400_nopad_as_ci'
    ORDER BY columns_info.TABLE_NAME;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET migration_done = TRUE;

  SET content_schema_name = DATABASE();
  OPEN content_tables;
  migrate_content_tables: LOOP
    FETCH content_tables INTO content_table_name;
    IF migration_done THEN
      LEAVE migrate_content_tables;
    END IF;

    EXECUTE IMMEDIATE CONCAT(
      'ALTER TABLE `', REPLACE(content_schema_name, '`', '``'), '`.`',
      REPLACE(content_table_name, '`', '``'),
      '` MODIFY COLUMN `path` varchar(4096) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci NOT NULL,',
      ' MODIFY COLUMN `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_ci NOT NULL'
    );
  END LOOP;
  CLOSE content_tables;
END;
