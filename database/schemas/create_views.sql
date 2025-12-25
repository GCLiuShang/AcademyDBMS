-- 创建视图
-- 注意：视图依赖于已创建的表，应在所有表创建完成后执行

DROP VIEW IF EXISTS `View_Classroom_Occupancy`;

CREATE VIEW `View_Classroom_Occupancy` AS
SELECT
  '课程' COLLATE utf8mb4_0900_ai_ci AS `Occ_type`,
  CONCAT(`ac`.`ArrangeCo_Courno`, '#', LPAD(`ac`.`ArrangeCo_classhour`, 4, '0')) AS `Occ_id`,
  `ac`.`ArrangeCo_Clrmname` AS `Clrm_name`,
  `ac`.`ArrangeCo_date` AS `Occ_date`,
  `ac`.`ArrangeCo_Lno` AS `Occ_lesson_no`,
  TIMESTAMP(STR_TO_DATE(`ac`.`ArrangeCo_date`, '%Y-%m-%d'), `l`.`Ltime_begin`) AS `Occ_begin`,
  TIMESTAMP(STR_TO_DATE(`ac`.`ArrangeCo_date`, '%Y-%m-%d'), `l`.`Ltime_end`) AS `Occ_end`,
  `ac`.`ArrangeCo_status` AS `Occ_status`,
  `ac`.`ArrangeCo_Courno` AS `Cour_no`,
  `ac`.`ArrangeCo_classhour` AS `Cour_classhour`,
  NULL AS `Eno`,
  NULL AS `ArrangeE_ID`
FROM `Arrange_Course` `ac`
JOIN `Lesson` `l`
  ON `l`.`Lno` = `ac`.`ArrangeCo_Lno`
WHERE `ac`.`ArrangeCo_Clrmname` IS NOT NULL
  AND `ac`.`ArrangeCo_date` IS NOT NULL
  AND `ac`.`ArrangeCo_Lno` IS NOT NULL
  AND `ac`.`ArrangeCo_status` <> '已结束'

UNION ALL

SELECT
  '考试' COLLATE utf8mb4_0900_ai_ci AS `Occ_type`,
  `ae`.`ArrangeE_ID` AS `Occ_id`,
  `ae`.`ArrangeE_Clrmname` AS `Clrm_name`,
  DATE(`se`.`SetupE_Etime_begin`) AS `Occ_date`,
  NULL AS `Occ_lesson_no`,
  `se`.`SetupE_Etime_begin` AS `Occ_begin`,
  `se`.`SetupE_Etime_end` AS `Occ_end`,
  `e`.`Estatus` AS `Occ_status`,
  NULL AS `Cour_no`,
  NULL AS `Cour_classhour`,
  `ae`.`ArrangeE_Eno` AS `Eno`,
  `ae`.`ArrangeE_ID` AS `ArrangeE_ID`
FROM `Arrange_Exam` `ae`
JOIN `Exam` `e`
  ON `e`.`Eno` = `ae`.`ArrangeE_Eno`
JOIN (
  SELECT `se1`.*
  FROM `Setup_Exam` `se1`
  JOIN (
    SELECT
      `SetupE_Eno`,
      MAX(`SetupE_ID`) AS `MaxSetupE_ID`
    FROM `Setup_Exam`
    WHERE `SetupE_status` = '审核通过'
    GROUP BY `SetupE_Eno`
  ) `semax`
    ON `semax`.`SetupE_Eno` = `se1`.`SetupE_Eno`
   AND `semax`.`MaxSetupE_ID` = `se1`.`SetupE_ID`
) `se`
  ON `se`.`SetupE_Eno` = `ae`.`ArrangeE_Eno`
WHERE `e`.`Estatus` NOT IN ('已结束', '已取消');

