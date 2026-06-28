SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET character_set_connection = utf8mb4;
SET character_set_results = utf8mb4;
SET character_set_client = utf8mb4;

CREATE DATABASE IF NOT EXISTS `academy_database` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `academy_database`;

SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET FOREIGN_KEY_CHECKS = 1;

SOURCE /dbfiles/schemas/create_entity_tables.sql;
SOURCE /dbfiles/schemas/create_relationship_tables.sql;
SOURCE /dbfiles/schemas/create_views.sql;
SOURCE /dbfiles/initialization/initialization.sql;

SELECT 'Database initialization completed successfully!' AS status;
SELECT COUNT(*) AS total_tables FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'academy_database';