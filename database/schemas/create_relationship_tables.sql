CREATE TABLE Setup_Curricular_G (
    SetupCuG_ID VARCHAR(20) NOT NULL,
    SetupCuG_date DATE NOT NULL,
    SetupCuG_number INT NOT NULL COMMENT '同SetupCuG_date下递增（每天重置）',
    SetupCuG_Cno VARCHAR(10) NOT NULL,
    SetupCuG_Cname VARCHAR(20) NOT NULL,
    SetupCuG_Ccredit TINYINT NOT NULL DEFAULT 0,
    SetupCuG_Cclasshour INT NOT NULL,
    SetupCuG_Ceattri ENUM ('无','大作业','线上','线下开卷','线下闭卷') NOT NULL DEFAULT '无',
    SetupCuG_description VARCHAR(50) DEFAULT NULL,
    SetupCuG_status ENUM('等待审核','已经通过','已经取消') NOT NULL DEFAULT '等待审核',
    SetupCuG_createtime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (SetupCuG_ID),
    FOREIGN KEY (SetupCuG_Cno) REFERENCES Cno_Pool(Cno),
    CHECK (SetupCuG_ID REGEXP '^SETCUG[0-9]{8}-[0-9A-F]{5}$'),
    CHECK (SetupCuG_number BETWEEN 0 AND 1048575),
    CHECK (SetupCuG_Cclasshour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Setup_Curricular_P (
    SetupCuP_ID VARCHAR(20) NOT NULL,
    SetupCuP_date DATE NOT NULL,
    SetupCuP_number INT NOT NULL COMMENT '同SetupCuP_date下递增（每天重置）',
    SetupCuP_Cno VARCHAR(10) NOT NULL COMMENT '通识选修或个性课程',
    SetupCuP_Cname VARCHAR(20) NOT NULL,
    SetupCuP_Ccredit TINYINT NOT NULL DEFAULT 0,
    SetupCuP_Cclasshour INT NOT NULL,
    SetupCuP_Ceattri ENUM ('无','大作业','线上','线下开卷','线下闭卷') NOT NULL DEFAULT '无',
    SetupCuP_description VARCHAR(50) DEFAULT NULL,
    SetupCuP_status ENUM('等待审核','等待选课','已经通过','未能开课','已经取消') NOT NULL DEFAULT '等待审核',
    SetupCuP_createPno VARCHAR(10) NOT NULL,
    SetupCuP_createtime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (SetupCuP_ID),
    FOREIGN KEY (SetupCuP_Cno) REFERENCES Cno_Pool(Cno),
    FOREIGN KEY (SetupCuP_createPno) REFERENCES Professor(Pno),
    CHECK (SetupCuP_ID REGEXP '^SETCUP[0-9]{8}-[0-9A-F]{5}$'),
    CHECK (SetupCuP_number BETWEEN 0 AND 1048575),
    CHECK (SetupCuP_Cclasshour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Setup_Course (
    SetupCo_Courno VARCHAR(20) NOT NULL,
    SetupCo_campus VARCHAR(8) NOT NULL,
    SetupCo_pmax INT NOT NULL COMMENT '0~120',
    SetupCo_status ENUM('等待审核','等待选课','未能开课','已经通过','已经取消') NOT NULL DEFAULT '等待审核',
    SetupCo_createPno VARCHAR(10) NOT NULL,
    SetupCo_createtime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (SetupCo_Courno),
    FOREIGN KEY (SetupCo_campus) REFERENCES Campus(Cam_name),
    FOREIGN KEY (SetupCo_createPno) REFERENCES Professor(Pno),
    CHECK (SetupCo_pmax BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SetupCo_Prof (
    SetupCo_Courno VARCHAR(20) NOT NULL,
    SetupCo_Pno VARCHAR(10) NOT NULL,
    PRIMARY KEY (SetupCo_Courno, SetupCo_Pno),
    FOREIGN KEY (SetupCo_Courno) REFERENCES Setup_Course(SetupCo_Courno),
    FOREIGN KEY (SetupCo_Pno) REFERENCES Professor(Pno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SetupCo_DofW (
    SetupCo_Courno VARCHAR(20) NOT NULL,
    SetupCo_dayofweek ENUM('1','2','3','4','5','6','7') NOT NULL,
    PRIMARY KEY (SetupCo_Courno, SetupCo_dayofweek),
    FOREIGN KEY (SetupCo_Courno) REFERENCES Setup_Course(SetupCo_Courno),
    FOREIGN KEY (SetupCo_dayofweek) REFERENCES Dayofweek(Day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Arrange_Course (
    ArrangeCo_Courno VARCHAR(20) NOT NULL,
    ArrangeCo_classhour INT NOT NULL,
    ArrangeCo_Lno ENUM('01','02','03','04','05','06','07','08','09','10','11','12','13') DEFAULT NULL,
    ArrangeCo_date VARCHAR(10) DEFAULT NULL,
    ArrangeCo_Clrmname VARCHAR(30) DEFAULT NULL,
    ArrangeCo_Pno VARCHAR(10) DEFAULT NULL,
    ArrangeCo_status ENUM('待上课','调课中','上课中','已结束') NOT NULL DEFAULT '待上课',
    PRIMARY KEY (ArrangeCo_Courno, ArrangeCo_classhour),
    FOREIGN KEY (ArrangeCo_Courno) REFERENCES Course(Cour_no),
    FOREIGN KEY (ArrangeCo_Lno) REFERENCES Lesson(Lno),
    FOREIGN KEY (ArrangeCo_date) REFERENCES Date(Date_no),
    FOREIGN KEY (ArrangeCo_Clrmname) REFERENCES Classroom(Clrm_name),
    FOREIGN KEY (ArrangeCo_Pno) REFERENCES Professor(Pno),
    CHECK (ArrangeCo_classhour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Setup_Exam (
    SetupE_ID VARCHAR(20) NOT NULL,
    SetupE_date DATE NOT NULL,
    SetupE_number INT NOT NULL COMMENT '同SetupE_date下递增（每天重置）',
    SetupE_Cno VARCHAR(10) NOT NULL,
    SetupE_Eno VARCHAR(10) NOT NULL,
    SetupE_Esemeno VARCHAR(5) NOT NULL,
    SetupE_Enumber INT NOT NULL COMMENT '每学期重置',
    SetupE_Eattri ENUM('正考','补缓考','其他') NOT NULL,
    SetupE_Etime_begin DATETIME NOT NULL,
    SetupE_Etime_end DATETIME NOT NULL,
    SetupE_status ENUM('等待审核','审核通过','已经取消') NOT NULL DEFAULT '等待审核',
    PRIMARY KEY (SetupE_ID),
    FOREIGN KEY (SetupE_Cno) REFERENCES Curricular(Cno),
    CHECK (SetupE_ID REGEXP '^SETCE[0-9]{8}-[0-9A-F]{6}$'),
    CHECK (SetupE_number BETWEEN 0 AND 16777215),
    CHECK (SetupE_Enumber BETWEEN 0 AND 4095),
    CHECK (SetupE_Etime_end > SetupE_Etime_begin),
    CHECK (TIMEDIFF(SetupE_Etime_end, SetupE_Etime_begin) BETWEEN '00:30:00' AND '03:00:00')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Arrange_Exam (
    ArrangeE_ID VARCHAR(14) NOT NULL,
    ArrangeE_Eno VARCHAR(10) NOT NULL,
    ArrangeE_number INT NOT NULL COMMENT '对每个ArrangeE_Eno递增',
    ArrangeE_Clrmname VARCHAR(30) NOT NULL,
    PRIMARY KEY (ArrangeE_ID),
    FOREIGN KEY (ArrangeE_Eno) REFERENCES Exam(Eno),
    FOREIGN KEY (ArrangeE_Clrmname) REFERENCES Classroom(Clrm_name),
    CHECK (ArrangeE_ID REGEXP '^[A-Z0-9]{10}-[0-9A-F]{3}$'),
    CHECK (ArrangeE_number BETWEEN 0 AND 4095)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Take_Exam (
    TakingE_ArrangeEID VARCHAR(13) NOT NULL,
    TakingE_Sno VARCHAR(10) NOT NULL,
    TakingE_Seatno INT DEFAULT NULL COMMENT '0-100',
    TakingE_Status ENUM('等待开考','已经参考','申请缓考','考试取消') NOT NULL DEFAULT '等待开考',
    TakingE_Grade FLOAT NOT NULL DEFAULT 0 COMMENT '0-100',
    TakingE_G2Pno VARCHAR(10),
    TakingE_GIsValid BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (TakingE_ArrangeEID, TakingE_Sno),
    FOREIGN KEY (TakingE_ArrangeEID) REFERENCES Arrange_Exam(ArrangeE_ID),
    FOREIGN KEY (TakingE_Sno) REFERENCES Student(Sno),
    FOREIGN KEY (TakingE_G2Pno) REFERENCES Professor(Pno),
    CHECK (TakingE_Seatno IS NULL OR (TakingE_Seatno BETWEEN 0 AND 100)),
    CHECK (TakingE_Grade BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Invigilate (
    Invigilate_ArrangeEID VARCHAR(13) NOT NULL,
    Invigilate_Pno VARCHAR(10) NOT NULL,
    Invigilate_Status ENUM('等待开始','已经监考','安排调整','考试取消') NOT NULL DEFAULT '等待开始',
    PRIMARY KEY (Invigilate_ArrangeEID, Invigilate_Pno),
    FOREIGN KEY (Invigilate_ArrangeEID) REFERENCES Arrange_Exam(ArrangeE_ID),
    FOREIGN KEY (Invigilate_Pno) REFERENCES Professor(Pno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE TP_Curricular (
    TPno VARCHAR(11) NOT NULL,
    Cno VARCHAR(10) NOT NULL,
    PRIMARY KEY (TPno, Cno),
    FOREIGN KEY (TPno) REFERENCES TrainingProgram(TPno),
    FOREIGN KEY (Cno) REFERENCES Curricular(Cno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Prerequisite_temp (
    Cno_later VARCHAR(10) NOT NULL,
    Cno_former VARCHAR(10) NOT NULL,
    PRIMARY KEY (Cno_later, Cno_former),
    FOREIGN KEY (Cno_later) REFERENCES Cno_Pool(Cno),
    FOREIGN KEY (Cno_former) REFERENCES Curricular(Cno),
    CHECK (Cno_later != Cno_former)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Prerequisite (
    Cno_later VARCHAR(10) NOT NULL,
    Cno_former VARCHAR(10) NOT NULL,
    PRIMARY KEY (Cno_later, Cno_former),
    FOREIGN KEY (Cno_later) REFERENCES Curricular(Cno),
    FOREIGN KEY (Cno_former) REFERENCES Curricular(Cno),
    CHECK (Cno_later != Cno_former)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Pursuit (
    Pursue_Sno VARCHAR(10) NOT NULL,
    Pursue_Courno VARCHAR(10) NOT NULL,
    PRIMARY KEY (Pursue_Sno, Pursue_Courno),
    FOREIGN KEY (Pursue_Sno) REFERENCES Student(Sno),
    FOREIGN KEY (Pursue_Courno) REFERENCES Course(Cour_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Enrollment (
    Enroll_Courno VARCHAR(20) NOT NULL,
    Enroll_Sno VARCHAR(10) NOT NULL,
    Enroll_Cno VARCHAR(10) NOT NULL,
    PRIMARY KEY (Enroll_Courno, Enroll_Sno),
    FOREIGN KEY (Enroll_Courno) REFERENCES Course(Cour_no),
    FOREIGN KEY (Enroll_Sno) REFERENCES Student(Sno),
    FOREIGN KEY (Enroll_Cno) REFERENCES Curricular(Cno),
    UNIQUE KEY (Enroll_Sno, Enroll_Cno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Msg_Send (
    Msg_no VARCHAR(20) NOT NULL,
    Send_Uno VARCHAR(10) NOT NULL DEFAULT 'O000000000',
    Send_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Send_display BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (Msg_no, Send_Uno),
    FOREIGN KEY (Msg_no) REFERENCES Message(Msg_no),
    FOREIGN KEY (Send_Uno) REFERENCES User(Uno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Msg_Receive (
    Msg_no VARCHAR(20) NOT NULL,
    Receive_Uno VARCHAR(10) NOT NULL,
    Receive_time DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00',
    Receive_haveread BOOLEAN NOT NULL DEFAULT false,
    Receive_display BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (Msg_no, Receive_Uno),
    FOREIGN KEY (Msg_no) REFERENCES Message(Msg_no),
    FOREIGN KEY (Receive_Uno) REFERENCES User(Uno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Curricular_isOpen (
    Semeno VARCHAR(10) NOT NULL,
    Curricular_isOpen BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (Semeno),
    FOREIGN KEY (Semeno) REFERENCES Semester(Seme_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Course_isOpen (
    Semeno VARCHAR(10) NOT NULL,
    Course_isOpen BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (Semeno),
    FOREIGN KEY (Semeno) REFERENCES Semester(Seme_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Enroll_isOpen (
    Semeno VARCHAR(10) NOT NULL,
    Enroll_isOpen BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (Semeno),
    FOREIGN KEY (Semeno) REFERENCES Semester(Seme_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TRIGGER IF EXISTS trg_course_closed_update_setup_course;
DELIMITER $$
CREATE TRIGGER trg_course_closed_update_setup_course
AFTER UPDATE ON Course
FOR EACH ROW
BEGIN
  IF NEW.Cour_status = '已关闭' AND OLD.Cour_status <> '已关闭' THEN
    UPDATE Setup_Course
    SET SetupCo_status = '未能开课'
    WHERE SetupCo_Courno = NEW.Cour_no
      AND SetupCo_status IN ('等待审核', '等待选课');
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_cno_pool_available_delete_prerequisite;
DELIMITER $$
CREATE TRIGGER trg_cno_pool_available_delete_prerequisite
AFTER UPDATE ON Cno_Pool
FOR EACH ROW
BEGIN
  IF NEW.Cno_status = '可用' AND OLD.Cno_status <> '可用' THEN
    DELETE FROM Prerequisite
    WHERE Cno_later = NEW.Cno;
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS DBAdmin_Grant (
    Uno VARCHAR(10) NOT NULL,
    MySQL_User VARCHAR(64) NOT NULL,
    Granted_By VARCHAR(10) NOT NULL,
    Granted_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Is_Active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (Uno, MySQL_User),
    KEY idx_mysql_user (MySQL_User),
    CONSTRAINT fk_dbadmin_grant_uno FOREIGN KEY (Uno) REFERENCES User(Uno) ON DELETE CASCADE,
    CONSTRAINT fk_dbadmin_grant_granted_by FOREIGN KEY (Granted_By) REFERENCES User(Uno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;