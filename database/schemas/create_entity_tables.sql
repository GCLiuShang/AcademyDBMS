CREATE TABLE Department (
    Dept_no VARCHAR(2) NOT NULL COMMENT '学院编号',
    Dept_name VARCHAR(20) NOT NULL COMMENT '学院名称',
    Dept_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Dept_no),
    CHECK (Dept_no REGEXP '^[A-Z]{2}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Domain (
    Dom_no VARCHAR(4) NOT NULL COMMENT '专业编号',
    Dom_dept VARCHAR(2) NOT NULL,
    Dom_number INT NOT NULL COMMENT '同Dom_dept下递增',
    Dom_name VARCHAR(20) NOT NULL COMMENT '专业名称',
    Dom_shortname VARCHAR(8) NOT NULL,
    Dom_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Dom_no),
    FOREIGN KEY (Dom_dept) REFERENCES Department(Dept_no),
    UNIQUE KEY (Dom_shortname),
    CHECK (Dom_no REGEXP '^[A-Z]{2}[0-9A-F]{2}$'),
    CHECK (Dom_number BETWEEN 0 AND 255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE TrainingProgram (
    TPno VARCHAR(11) NOT NULL COMMENT '培养方案编号',
    TPdom VARCHAR(4) NOT NULL,
    TPyear YEAR NOT NULL COMMENT '更新年份',
    TPname VARCHAR(52) NOT NULL,
    TPcredit_GB TINYINT NOT NULL DEFAULT 0,
    TPcredit_ZB TINYINT NOT NULL DEFAULT 0,
    TPcredit_ZX TINYINT NOT NULL DEFAULT 0,
    TPcredit_TX TINYINT NOT NULL DEFAULT 0,
    TPcredit_GX TINYINT NOT NULL DEFAULT 0,
    TPstatus ENUM('可使用', '调整中', '已停用') NOT NULL DEFAULT '调整中',
    PRIMARY KEY (TPno),
    FOREIGN KEY (TPdom) REFERENCES Domain(Dom_no),
    CHECK (TPno REGEXP '^TP[A-Z]{2}[0-9A-F]{2}-[0-9]{4}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Class (
    Class_name VARCHAR(10) NOT NULL,
    Class_dom VARCHAR(4) NOT NULL,
    Class_attri ENUM('普通', '卓越', '实验') NOT NULL DEFAULT '普通',
    Class_year VARCHAR(2) NOT NULL,
    Class_number INT NOT NULL COMMENT '同(Class_dom+Class_attri+Class_year)下递增',
    Class_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Class_name),
    FOREIGN KEY (Class_dom) REFERENCES Domain(Dom_no),
    CHECK (Class_name REGEXP '^[A-Z]{2}[0-9A-F]{2}(zy|sy)?[0-9]{2}[0-9A-F]{2}$'),
    CHECK (Class_year REGEXP '^[0-9]{2}$'),
    CHECK (Class_number BETWEEN 0 AND 255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Campus (
    Cam_name VARCHAR(8) NOT NULL,
    Cam_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Cam_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Building (
    Bd_name VARCHAR(18) NOT NULL,
    Bd_cam VARCHAR(8) NOT NULL,
    Bd_shortname VARCHAR(10) NOT NULL,
    Bd_attri ENUM('常规楼', '综合楼') NOT NULL DEFAULT '常规楼',
    Bd_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Bd_name),
    FOREIGN KEY (Bd_cam) REFERENCES Campus(Cam_name),
    CHECK (Bd_name REGEXP '^.{1,18}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Classroom (
    Clrm_name VARCHAR(30) NOT NULL,
    Clrm_bd VARCHAR(18) NOT NULL,
    Clrm_floor VARCHAR(2) DEFAULT NULL,
    Clrm_shortname VARCHAR(10) NOT NULL,
    Clrm_capacity TINYINT NOT NULL,
    Clrm_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Clrm_name),
    FOREIGN KEY (Clrm_bd) REFERENCES Building(Bd_name),
    CHECK (Clrm_capacity > 0),
    CHECK (Clrm_name REGEXP '^.{1,30}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Semester (
    Seme_no VARCHAR(5) NOT NULL,
    Seme_year YEAR NOT NULL,
    Seme_sequence ENUM('1', '2') NOT NULL,
    Week_max TINYINT NOT NULL,
    PRIMARY KEY (Seme_no),
    CHECK (Seme_no REGEXP '^[0-9]{4}[1-2]$'),
    CHECK (Week_max BETWEEN 0 AND 34)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Dayofweek (
    Day ENUM('1', '2', '3', '4', '5', '6', '7') NOT NULL,
    PRIMARY KEY (Day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Date (
    Date_no VARCHAR(10) NOT NULL,
    Date_seme VARCHAR(5) NOT NULL,
    Date_week TINYINT NOT NULL,
    Date_dayofweek ENUM('1', '2', '3', '4', '5', '6', '7') NOT NULL,
    Date_type ENUM('工作日', '休息日', '节假日', '调休日') NOT NULL DEFAULT '工作日',
    Date_holiday VARCHAR(20) DEFAULT NULL,
    Date_description VARCHAR(20) DEFAULT NULL,
    PRIMARY KEY (Date_no),
    FOREIGN KEY (Date_seme) REFERENCES Semester(Seme_no),
    FOREIGN KEY (Date_dayofweek) REFERENCES Dayofweek(Day),
    CHECK (Date_no REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Lesson (
    Lno ENUM('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13') NOT NULL,
    Ltime_begin TIME NOT NULL,
    Ltime_end TIME NOT NULL,
    PRIMARY KEY (Lno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE User (
    Uno VARCHAR(10) NOT NULL,
    Upswd VARCHAR(255) NOT NULL,
    Urole ENUM('学生', '教授', '学院教学办管理员', '学校教务处管理员', '其他人员') NOT NULL,
    Utime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Ustatus ENUM('离线', '在线', '锁定') NOT NULL DEFAULT '离线',
    Ulasttrytime DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00',
    Ulosetimes INT NOT NULL DEFAULT 0,
    PRIMARY KEY (Uno),
    CHECK (Ulosetimes BETWEEN 0 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE User_Session (
    Sid CHAR(64) NOT NULL,
    Uno VARCHAR(10) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    LastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt DATETIME NOT NULL,
    Ip VARCHAR(64) DEFAULT NULL,
    Ua VARCHAR(255) DEFAULT NULL,
    Revoked TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (Sid),
    KEY idx_user_session_uno (Uno),
    KEY idx_user_session_expires (ExpiresAt),
    FOREIGN KEY (Uno) REFERENCES User(Uno) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Student (
    Sno VARCHAR(10) NOT NULL,
    Syear YEAR NOT NULL,
    Snumber INT NOT NULL COMMENT '同Syear下递增',
    Sname VARCHAR(20) NOT NULL,
    Ssex ENUM('男', '女') NOT NULL,
    Sclass VARCHAR(10) DEFAULT NULL,
    Sstatus ENUM('在读', '调整', '休学', '退学', '毕业') NOT NULL DEFAULT '在读',
    PRIMARY KEY (Sno),
    FOREIGN KEY (Sno) REFERENCES User(Uno),
    FOREIGN KEY (Sclass) REFERENCES Class(Class_name),
    CHECK (Sno REGEXP '^S[0-9]{4}[0-9A-F]{5}$'),
    CHECK (Snumber BETWEEN 0 AND 1048575)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Professor (
    Pno VARCHAR(10) NOT NULL,
    Pyear YEAR NOT NULL,
    Pnumber INT NOT NULL COMMENT '同Pyear下递增',
    Pname VARCHAR(20) NOT NULL,
    Psex ENUM('男', '女') NOT NULL,
    Ptitle ENUM('教授', '副教授', '讲师', '研究员') NOT NULL,
    Pdept VARCHAR(2) DEFAULT NULL,
    Poffice VARCHAR(10) DEFAULT NULL,
    Pstatus ENUM('在职', '调整', '离职') NOT NULL DEFAULT '在职',
    PRIMARY KEY (Pno),
    FOREIGN KEY (Pno) REFERENCES User(Uno),
    FOREIGN KEY (Pdept) REFERENCES Department(Dept_no),
    CHECK (Pno REGEXP '^P[0-9]{4}[0-9A-F]{5}$'),
    CHECK (Pnumber BETWEEN 0 AND 1048575)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Dept_Adm (
    DAno VARCHAR(10) NOT NULL,
    DAyear YEAR NOT NULL,
    DAnumber INT NOT NULL COMMENT '同DAyear下递增',
    DAdept VARCHAR(2) NOT NULL,
    DAname VARCHAR(20) NOT NULL,
    DAstatus ENUM('在职', '调整', '离职') NOT NULL DEFAULT '在职',
    PRIMARY KEY (DAno),
    FOREIGN KEY (DAno) REFERENCES User(Uno),
    FOREIGN KEY (DAdept) REFERENCES Department(Dept_no),
    CHECK (DAno REGEXP '^DA[0-9]{4}[0-9A-F]{4}$'),
    CHECK (DAnumber BETWEEN 0 AND 65535)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Univ_Adm (
    UAno VARCHAR(10) NOT NULL,
    UAyear YEAR NOT NULL,
    UAnumber INT NOT NULL,
    UAname VARCHAR(20) NOT NULL,
    UAstatus ENUM('在职', '调整', '离职') NOT NULL DEFAULT '在职',
    PRIMARY KEY (UAno),
    FOREIGN KEY (UAno) REFERENCES User(Uno),
    CHECK (UAno REGEXP '^UA[0-9]{4}[0-9A-F]{4}$'),
    CHECK (UAnumber BETWEEN 0 AND 65535)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Other (
    Ono VARCHAR(10) NOT NULL,
    Oyear YEAR NOT NULL,
    Onumber INT NOT NULL COMMENT '同Oyear下递增',
    Oname VARCHAR(20) NOT NULL,
    Odescription VARCHAR(50) NOT NULL,
    PRIMARY KEY (Ono),
    CHECK (Ono REGEXP '^O[0-9]{4}[0-9A-F]{5}$'),
    CHECK (Onumber BETWEEN 0 AND 1048575)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Cno_Pool (
    Cno VARCHAR(10) NOT NULL,
    Cattri ENUM('公共必修','专业必修','专业选修','通识选修','个性课程') NOT NULL,
    Cdept VARCHAR(2) NOT NULL,
    Cseme ENUM('第一学期','第二学期','第三学期','第四学期','第五学期','第六学期','第七学期','第八学期','第九学期','第十学期','第十一学期','第十二学期','第一和第二学期','第三和第四学期','第五和第六学期','第七和第八学期','第九和第十学期','第十一和第十二学期','奇数学期','偶数学期','任意学期') NOT NULL,
    Cnumber INT NOT NULL COMMENT '同(Cattri+Cdept+Cseme)下递增',
    Cno_status ENUM('可用','正在调整','不可用') NOT NULL DEFAULT '可用',
    PRIMARY KEY (Cno),
    FOREIGN KEY (Cdept) REFERENCES Department(Dept_no),
    CHECK (Cno REGEXP '^C[A-Z]{2}[A-Z]{2}[0-9A-F]{2}[0-9A-F]{3}$'),
    CHECK (Cnumber BETWEEN 0 AND 4095)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Curricular (
    Cno VARCHAR(10) NOT NULL,
    Cname VARCHAR(20) NOT NULL,
    Ccredit TINYINT NOT NULL DEFAULT 0,
    C_classhour INT NOT NULL,
    C_eattri ENUM('无', '大作业', '线上', '线下开卷', '线下闭卷') NOT NULL DEFAULT '无',
    Cdescription VARCHAR(50) DEFAULT NULL,
    Cstatus ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常',
    PRIMARY KEY (Cno),
    FOREIGN KEY (Cno) REFERENCES Cno_Pool(Cno),
    CHECK (Cno REGEXP '^C[A-Z]{2}[A-Z]{2}[0-9A-F]{2}[0-9A-F]{3}$'),
    CHECK (C_classhour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Course (
    Cour_no VARCHAR(20) NOT NULL,
    Cour_cno VARCHAR(10) NOT NULL,
    Cour_seme VARCHAR(5) NOT NULL,
    Cour_number INT NOT NULL COMMENT '同(Cour_cno+Cour_seme)下递增',
    Cour_pmax TINYINT NOT NULL,
    Cour_pnow TINYINT NOT NULL DEFAULT 0,
    Cour_status ENUM('未开始', '进行中', '已关闭', '已结束') NOT NULL DEFAULT '未开始',
    PRIMARY KEY (Cour_no),
    FOREIGN KEY (Cour_cno) REFERENCES Curricular(Cno),
    FOREIGN KEY (Cour_seme) REFERENCES Semester(Seme_no),
    CHECK (Cour_no REGEXP '^[A-Z0-9]{10}-[0-9]{5}-[0-9A-F]{3}$'),
    CHECK (Cour_pmax BETWEEN 1 AND 120),
    CHECK (Cour_pnow BETWEEN 0 AND Cour_pmax),
    CHECK (Cour_number BETWEEN 0 AND 4095)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Exam (
    Eno VARCHAR(10) NOT NULL,
    E_cno VARCHAR(10) NOT NULL,
    Eattri ENUM('正考', '补缓考', '其他') NOT NULL,
    Estatus ENUM('未开始', '调整中', '进行中', '已结束', '已取消') NOT NULL DEFAULT '未开始',
    PRIMARY KEY (Eno),
    FOREIGN KEY (E_cno) REFERENCES Curricular(Cno),
    CHECK (Eno REGEXP '^E[0-9]{5}[0-9A-F]{3}[ZHT]$'),
    CHECK (Eattri IN ('正考', '补缓考', '其他'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Message (
    Msg_no VARCHAR(20) NOT NULL,
    Msg_date DATE NOT NULL,
    Msg_number BIGINT NOT NULL COMMENT '同Msg_date下递增',
    Msg_category ENUM('通知', '代办', '系统', '撤回') NOT NULL,
    Msg_wdMsgno VARCHAR(20) DEFAULT NULL,
    Msg_priority ENUM('一般', '重要') NOT NULL DEFAULT '一般',
    Msg_content VARCHAR(511) NOT NULL,
    PRIMARY KEY (Msg_no),
    FOREIGN KEY (Msg_wdMsgno) REFERENCES Message(Msg_no),
    CHECK (Msg_no REGEXP '^MSG[0-9]{8}[0-9A-F]{9}$'),
    CHECK (Msg_number BETWEEN 0 AND 68719476735)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;