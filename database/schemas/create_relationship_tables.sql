-- 创建关系表
-- 注意：执行顺序很重要，需要先创建被引用的表
-- 同时需要确保对应的实体表已经创建

-- 创建申请开设公共/专业课程(学院)表
CREATE TABLE Setup_Curricular_G (
    SetupCuG_ID VARCHAR(20) NOT NULL COMMENT '申请课程业务ID: "SETCUG" + "YYYYMMDD"(SetupCuG_date中, 转VARCHAR) + "-" + SetupCuG_number(转16进制对应的5位字符串), 如: SETCUG20250902-01A4C',
    SetupCuG_date DATE NOT NULL COMMENT '申请课程业务日期: 业务完成(提交)时系统时间',
    SetupCuG_number INT NOT NULL COMMENT '业务号码: 在SetupCuG_date下递增(即每天重置一次), 0~16^5-1, 不回收',
    SetupCuG_Cno VARCHAR(10) NOT NULL COMMENT '申请课程预编号: 应用层根据用户输入的Cattri, Cdept, Cseme在Cno_Pool中获得SetupCuG_Cno, 回收',
    SetupCuG_Cname VARCHAR(20) NOT NULL COMMENT '申请课程名称',
    SetupCuG_Ccredit TINYINT NOT NULL DEFAULT 0 COMMENT '申请课程学分',
    SetupCuG_Cclasshour INT NOT NULL COMMENT '申请课程课时',
    SetupCuG_Ceattri ENUM ('无','大作业','线上','线下开卷','线下闭卷') NOT NULL DEFAULT '无' COMMENT '申请课程性质: ["无" | "大作业" | "线上" | "线下开卷" | "线下闭卷"]',
    SetupCuG_description VARCHAR(50) DEFAULT NULL COMMENT '申请课程描述',
    SetupCuG_status ENUM('等待审核','已经通过','已经取消') NOT NULL DEFAULT '等待审核' COMMENT '申请课程状态: ["等待审核" | "已经通过" | "已经取消"], 等待审核->: (1)已经通过 (2)已经取消，选课开始前一天将所有状态为"等待审核"自动修改为"等待选课"，最后在选课结束后更新，若更新为"已经取消", 则需要级联更新Cno_Pool',
    SetupCuG_createtime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '业务创建时间: 业务完成(提交)时系统时间',
    PRIMARY KEY (SetupCuG_ID),
    FOREIGN KEY (SetupCuG_Cno) REFERENCES Cno_Pool(Cno),
    CHECK (SetupCuG_ID REGEXP '^SETCUG[0-9]{8}-[0-9A-F]{5}$'),
    CHECK (SetupCuG_number BETWEEN 0 AND 1048575), -- 16^5-1
    CHECK (SetupCuG_Cclasshour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请开设公共/专业课程(学院)表: 1. 由学院教学办管理员操作，开设公共必修/专业必修/专业选修 2. 当SetupCuG_Cno在Cno_Pool中不存在时，需新建对应Cno_Pool 3. 所有字段在业务创建后不得修改，只有取消后创建新业务 4. 选课周期开始前的一段时间，每天定时检查在当前学期开课的(根据Cno_Pool中的Cseme)Curricular对应的当前学期的(根据Cour_no中的Cour_semeno)Setup_Course，若不存在则向相应学院教学办管理员发送相关提醒';

-- 创建申请开设通识/个性课程(教授)表
CREATE TABLE Setup_Curricular_P (
    SetupCuP_ID VARCHAR(20) NOT NULL COMMENT '申请课程业务ID: "SETCUP" + "YYYYMMDD"(SetupCuP_date中, 转VARCHAR) + "-" + SetupCuP_number(转16进制对应的5位字符串), 如: SETCUP20250902-01A4C',
    SetupCuP_date DATE NOT NULL COMMENT '申请课程业务日期: 业务完成(提交)时系统时间',
    SetupCuP_number INT NOT NULL COMMENT '业务号码: 在SetupCuP_date下递增(即每天重置一次), 0~16^5-1, 不回收',
    SetupCuP_Cno VARCHAR(10) NOT NULL COMMENT '申请课程预编号: 应用层根据用户输入的Cattri, Cdept, Cseme在Cno_Pool中获得SetupCuP_Cno, 要求Cattri必须为通识选修或个性课程, 回收',
    SetupCuP_Cname VARCHAR(20) NOT NULL COMMENT '申请课程名称',
    SetupCuP_Ccredit TINYINT NOT NULL DEFAULT 0 COMMENT '申请课程学分',
    SetupCuP_Cclasshour INT NOT NULL COMMENT '申请课程课时',
    SetupCuP_Ceattri ENUM ('无','大作业','线上','线下开卷','线下闭卷') NOT NULL DEFAULT '无' COMMENT '申请课程性质: ["无" | "大作业" | "线上" | "线下开卷" | "线下闭卷"]',
    SetupCuP_description VARCHAR(50) DEFAULT NULL COMMENT '申请课程描述',
    SetupCuP_status ENUM('等待审核','等待选课','已经通过','未能开课','已经取消') NOT NULL DEFAULT '等待审核' COMMENT '申请课程状态: ["等待审核" | "等待选课" | "已经通过" | "未能开课" | "已经取消"], 等待审核->: (1)等待选课->已经通过 (2)等待选课->未能开课 (3)已经取消 (4)等待选课(选课开始前)->已经取消，选课开始前一天将所有状态为"等待审核"自动修改为"等待选课"，最后在选课结束后更新，通过逐个检查对应的当前学期的(根据Cour_no中的Cour_semeno)Setup_Course的状态，若均为"未能开课"，则更新为"未能开课"，若更新为"未能开课"或"已经取消", 则需要级联更新Cno_Pool',
    SetupCuP_createPno VARCHAR(10) NOT NULL COMMENT '业务创建教授编号',
    SetupCuP_createtime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '业务创建时间: 业务完成(提交)时系统时间',
    PRIMARY KEY (SetupCuP_ID),
    FOREIGN KEY (SetupCuP_Cno) REFERENCES Cno_Pool(Cno),
    FOREIGN KEY (SetupCuP_createPno) REFERENCES Professor(Pno),
    CHECK (SetupCuP_ID REGEXP '^SETCUP[0-9]{8}-[0-9A-F]{5}$'),
    CHECK (SetupCuP_number BETWEEN 0 AND 1048575), -- 16^5-1
    CHECK (SetupCuP_Cclasshour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请开设通识/个性课程(教授)表: 1. 教授以个人名义申请开设通识选修/个性课程 2. 当SetupCuP_Cno在Cno_Pool中不存在时，需新建对应Cno_Pool 3. 所有字段在业务创建后不得修改，只有取消后创建新业务 4. 对于审核通过的通识选修/个性课程(查询Curricular表)，不再由教授发起申请业务，而是由学校教务处管理员在选课前，保持SetupCuP_Pno, SetupCuP_Cno不变下打开新业务，应用层提醒教授处理。若教授同意则状态修改为"等待选课" 5. 选课周期开始前的一段时间，每天定时检查在当前学期开课的(根据Cno_Pool中的Cseme)Curricular对应的当前学期的(根据Cour_no中的Cour_semeno)Setup_Course，若不存在则向相应教授发送相关提醒';

-- 创建申请开课表
CREATE TABLE Setup_Course (
    SetupCo_Courno VARCHAR(20) NOT NULL COMMENT '申请课编号: 应用层根据用户(教授)所在Department筛选Cno_Pool.Cno，根据选择的Cour_cno以及系统给出的Cour_semeno, Cour_number，得到SetupCo_Courno',
    SetupCo_campus VARCHAR(8) NOT NULL COMMENT '申请课意向校区',
    SetupCo_pmax INT NOT NULL COMMENT '申请课意向最大人数: 0~120, 输入超过120则提示：需新建一个新业务, 并自动修改为120',
    SetupCo_status ENUM('等待审核','等待选课','未能开课','已经通过','已经取消') NOT NULL DEFAULT '等待审核' COMMENT '申请课状态: ["等待审核" | "等待选课" | "未能开课" | "已经通过" | "已经取消"], 等待审核->已经取消; 等待审核->等待选课->: (1)已经通过 (2)未能开课 (3)已经取消，选课开始前一天将所有状态为"等待审核"自动修改为"等待选课"',
    SetupCo_createPno VARCHAR(10) NOT NULL COMMENT '业务创建教授编号',
    SetupCo_createtime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '业务创建时间: 业务完成(提交)时系统时间',
    PRIMARY KEY (SetupCo_Courno),
    FOREIGN KEY (SetupCo_campus) REFERENCES Campus(Cam_name),
    FOREIGN KEY (SetupCo_createPno) REFERENCES Professor(Pno),
    CHECK (SetupCo_pmax BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请开课表';

-- 创建申请课教授关系表
CREATE TABLE SetupCo_Prof (
    SetupCo_Courno VARCHAR(20) NOT NULL COMMENT '申请课编号',
    SetupCo_Pno VARCHAR(10) NOT NULL COMMENT '申请课任教教授',
    PRIMARY KEY (SetupCo_Courno, SetupCo_Pno),
    FOREIGN KEY (SetupCo_Courno) REFERENCES Setup_Course(SetupCo_Courno),
    FOREIGN KEY (SetupCo_Pno) REFERENCES Professor(Pno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请课教授关系表: 辅助Setup_Course';

-- 创建申请课星期关系表
CREATE TABLE SetupCo_DofW (
    SetupCo_Courno VARCHAR(20) NOT NULL COMMENT '申请课编号',
    SetupCo_dayofweek ENUM('1','2','3','4','5','6','7') NOT NULL COMMENT '申请课意向星期',
    PRIMARY KEY (SetupCo_Courno, SetupCo_dayofweek),
    FOREIGN KEY (SetupCo_Courno) REFERENCES Setup_Course(SetupCo_Courno),
    FOREIGN KEY (SetupCo_dayofweek) REFERENCES Dayofweek(Day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请课星期关系表: 辅助Setup_Course';

-- 创建安排课表
CREATE TABLE Arrange_Course (
    ArrangeCo_Courno VARCHAR(20) NOT NULL COMMENT '课安排编号',
    ArrangeCo_classhour INT NOT NULL COMMENT '课安排课时: 1 ~ ArrangeCo_Courno->Curricular.C_classhour',
    ArrangeCo_Lno ENUM('01','02','03','04','05','06','07','08','09','10','11','12','13') DEFAULT NULL COMMENT '课安排对应课节: 上课后不得修改',
    ArrangeCo_date VARCHAR(10) DEFAULT NULL COMMENT '课安排对应日期: 上课后不得修改',
    ArrangeCo_Clrmname VARCHAR(30) DEFAULT NULL COMMENT '课安排对应教室名称: 上课后不得修改',
    ArrangeCo_Pno VARCHAR(10) DEFAULT NULL COMMENT '课安排对应任教教授: 结束后不得修改',
    ArrangeCo_status ENUM('待上课','调课中','上课中','已结束') NOT NULL DEFAULT '待上课' COMMENT '课安排状态: ...->上课中->已结束',
    PRIMARY KEY (ArrangeCo_Courno, ArrangeCo_classhour),
    FOREIGN KEY (ArrangeCo_Courno) REFERENCES Course(Cour_no),
    FOREIGN KEY (ArrangeCo_Lno) REFERENCES Lesson(Lno),
    FOREIGN KEY (ArrangeCo_date) REFERENCES Date(Date_no),
    FOREIGN KEY (ArrangeCo_Clrmname) REFERENCES Classroom(Clrm_name),
    FOREIGN KEY (ArrangeCo_Pno) REFERENCES Professor(Pno),
    CHECK (ArrangeCo_classhour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='安排课表';

-- 创建申请考试表
CREATE TABLE Setup_Exam (
    SetupE_ID VARCHAR(20) NOT NULL COMMENT '申请考试业务ID: "SETCE" + "YYYYMMDD"(SetupE_date中, 转VARCHAR) + "-" + SetupE_number(转16进制对应的6位字符串), 如: SETCE20251113-000B52',
    SetupE_date DATE NOT NULL COMMENT '申请考试业务日期: 当期系统时间',
    SetupE_number INT NOT NULL COMMENT '业务号码: 在SetupE_date下递增(即每天重置一次), 0~16^6-1, 不回收',
    SetupE_Cno VARCHAR(10) NOT NULL COMMENT '考试对应课程编号',
    SetupE_Eno VARCHAR(10) NOT NULL COMMENT '考试预编号: "E" + Esemeno(5) + Enumber(转16进制对应的3位字符串) + Eattri(对应的字符串), 如: E2025106CZ, 不回收',
    SetupE_Esemeno VARCHAR(5) NOT NULL COMMENT '考试学期编号: 本学期',
    SetupE_Enumber INT NOT NULL COMMENT '号码: 每学期重置一次, 递增, 0~16^3-1, 不回收',
    SetupE_Eattri ENUM('正考','补缓考','其他') NOT NULL COMMENT '申请考试性质: ["正考"(Z) | "补缓考"(H) | "其他"(T)]',
    SetupE_Etime_begin DATETIME NOT NULL COMMENT '申请考试开始时间',
    SetupE_Etime_end DATETIME NOT NULL COMMENT '申请考试结束时间: 由应用层获取考试持续时间，计算得考试结束时间',
    SetupE_status ENUM('等待审核','审核通过','已经取消') NOT NULL DEFAULT '等待审核' COMMENT '申请考试状态',
    PRIMARY KEY (SetupE_ID),
    FOREIGN KEY (SetupE_Cno) REFERENCES Curricular(Cno),
    CHECK (SetupE_ID REGEXP '^SETCE[0-9]{8}-[0-9A-F]{6}$'),
    CHECK (SetupE_number BETWEEN 0 AND 16777215), -- 16^6-1
    CHECK (SetupE_Enumber BETWEEN 0 AND 4095), -- 16^3-1
    CHECK (SetupE_Etime_end > SetupE_Etime_begin),
    CHECK (TIMEDIFF(SetupE_Etime_end, SetupE_Etime_begin) BETWEEN '00:30:00' AND '03:00:00')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请考试表';

-- 创建安排考试表
CREATE TABLE Arrange_Exam (
    ArrangeE_ID VARCHAR(14) NOT NULL COMMENT '考试安排ID: ArrangeE_Eno + "-" + ArrangeE_number(转16进制对应的3位字符串), 如: E2025106CZ-0E1',
    ArrangeE_Eno VARCHAR(10) NOT NULL COMMENT '考试安排对应考试编号',
    ArrangeE_number INT NOT NULL COMMENT '业务号码: 对每个ArrangeE_Eno递增, 0-16^3-1, 不回收, 一旦考试已经申请进行，那么安排只会涉及对教室的修改，或者本次考试整体取消',
    ArrangeE_Clrmname VARCHAR(30) NOT NULL COMMENT '对应教室名称',
    PRIMARY KEY (ArrangeE_ID),
    FOREIGN KEY (ArrangeE_Eno) REFERENCES Exam(Eno),
    FOREIGN KEY (ArrangeE_Clrmname) REFERENCES Classroom(Clrm_name),
    CHECK (ArrangeE_ID REGEXP '^[A-Z0-9]{10}-[0-9A-F]{3}$'),
    CHECK (ArrangeE_number BETWEEN 0 AND 4095) -- 16^3-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='安排考试表';

-- 创建学生参加考试表
CREATE TABLE Take_Exam (
    TakingE_ArrangeEID VARCHAR(13) NOT NULL COMMENT '对应考试安排ID',
    TakingE_Sno VARCHAR(10) NOT NULL COMMENT '参考学生学号',
    TakingE_Seatno INT DEFAULT NULL COMMENT '参考座位号: 0-100, 一次性安排, 不回收',
    TakingE_Status ENUM('等待开考','已经参考','申请缓考','考试取消') NOT NULL DEFAULT '等待开考' COMMENT '参考状态: ["等待开考" | "已经参考" | "申请缓考"(正考存在该状态, 补缓考和其他不存在) | "考试取消"], 若不为"考试取消", 当Estatus从"未开始"即将修改为"已取消"(处于"调整中"), 则级联修改为"考试取消"',
    TakingE_Grade FLOAT NOT NULL DEFAULT 0 COMMENT '参考成绩: 0-100, 默认为0',
    TakingE_G2Pno VARCHAR(10) COMMENT '参考成绩负责教授',
    TakingE_GIsValid BOOLEAN NOT NULL DEFAULT true COMMENT '参考成绩是否有效: 默认为true, 若为true, 当TakingE_Status修改为"申请缓考"或"考试取消", 则级联修改为false',
    PRIMARY KEY (TakingE_ArrangeEID, TakingE_Sno),
    FOREIGN KEY (TakingE_ArrangeEID) REFERENCES Arrange_Exam(ArrangeE_ID),
    FOREIGN KEY (TakingE_Sno) REFERENCES Student(Sno),
    FOREIGN KEY (TakingE_G2Pno) REFERENCES Professor(Pno),
    CHECK (TakingE_Seatno IS NULL OR (TakingE_Seatno BETWEEN 0 AND 100)),
    CHECK (TakingE_Grade BETWEEN 0 AND 100),
    CHECK (TakingE_Status IN ('等待开考','已经参考','申请缓考','考试取消'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生参加考试表';

-- 创建监考关系表
CREATE TABLE Invigilate (
    Invigilate_ArrangeEID VARCHAR(13) NOT NULL COMMENT '对应考试安排ID',
    Invigilate_Pno VARCHAR(10) NOT NULL COMMENT '监考教授编号',
    Invigilate_Status ENUM('等待开始','已经监考','安排调整','考试取消') NOT NULL DEFAULT '等待开始' COMMENT '监考状态: 若不为"考试取消", 当Estatus从"未开始"即将修改为"已取消"(处于"调整中"), 则级联修改为"考试取消"',
    PRIMARY KEY (Invigilate_ArrangeEID, Invigilate_Pno),
    FOREIGN KEY (Invigilate_ArrangeEID) REFERENCES Arrange_Exam(ArrangeE_ID),
    FOREIGN KEY (Invigilate_Pno) REFERENCES Professor(Pno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='监考关系表';

-- 创建培养方案课程关系表
CREATE TABLE TP_Curricular (
    TPno VARCHAR(11) NOT NULL COMMENT '培养方案编号',
    Cno VARCHAR(10) NOT NULL COMMENT '课程编号',
    PRIMARY KEY (TPno, Cno),
    FOREIGN KEY (TPno) REFERENCES TrainingProgram(TPno),
    FOREIGN KEY (Cno) REFERENCES Curricular(Cno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培养方案课程关系表';

-- 创建先修课程关系表-临时表
CREATE TABLE Prerequisite_temp (
    Cno_later VARCHAR(10) NOT NULL COMMENT '后置课程编号',
    Cno_former VARCHAR(10) NOT NULL COMMENT '前置课程编号: 与Cno_later不同',
    PRIMARY KEY (Cno_later, Cno_former),
    FOREIGN KEY (Cno_later) REFERENCES Cno_Pool(Cno),
    FOREIGN KEY (Cno_former) REFERENCES Curricular(Cno),
    CHECK (Cno_later != Cno_former)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='先修课程关系表-临时表';

-- 创建先修课程关系表
CREATE TABLE Prerequisite (
    Cno_later VARCHAR(10) NOT NULL COMMENT '后置课程编号',
    Cno_former VARCHAR(10) NOT NULL COMMENT '前置课程编号: 与Cno_later不同',
    PRIMARY KEY (Cno_later, Cno_former),
    FOREIGN KEY (Cno_later) REFERENCES Curricular(Cno),
    FOREIGN KEY (Cno_former) REFERENCES Curricular(Cno),
    CHECK (Cno_later != Cno_former)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='先修课程关系表';

-- 创建学生修读课程表
CREATE TABLE Pursuit (
    Pursue_Sno VARCHAR(10) NOT NULL COMMENT '修读学生学号',
    Pursue_Courno VARCHAR(10) NOT NULL COMMENT '修读课编号',
    PRIMARY KEY (Pursue_Sno, Pursue_Courno),
    FOREIGN KEY (Pursue_Sno) REFERENCES Student(Sno),
    FOREIGN KEY (Pursue_Courno) REFERENCES Course(Cour_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生修读课程表';

-- 创建学生选课表 (临时表)
CREATE TABLE Enrollment (
    Enroll_Courno VARCHAR(20) NOT NULL COMMENT '选课课编号',
    Enroll_Sno VARCHAR(10) NOT NULL COMMENT '选课学生学号: 联合唯一键(UK)',
    Enroll_Cno VARCHAR(10) NOT NULL COMMENT '选课课程编号: 联合唯一键(UK)',
    PRIMARY KEY (Enroll_Courno, Enroll_Sno),
    FOREIGN KEY (Enroll_Courno) REFERENCES Course(Cour_no),
    FOREIGN KEY (Enroll_Sno) REFERENCES Student(Sno),
    FOREIGN KEY (Enroll_Cno) REFERENCES Curricular(Cno),
    UNIQUE KEY (Enroll_Sno, Enroll_Cno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生选课表: 不满足3NF或BCNF，临时表，下次选课前删除上次选课表';

-- 创建消息发送表
CREATE TABLE Msg_Send (
    Msg_no VARCHAR(20) NOT NULL COMMENT '消息编号',
    Send_Uno VARCHAR(10) NOT NULL DEFAULT 'O000000000' COMMENT '发送用户编号',
    Send_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间: 发送端发送的系统时间',
    Send_display BOOLEAN NOT NULL DEFAULT true COMMENT '发送展示: 默认为true, 发送端"删除"该信息后更新为false, 且收回修改权限',
    PRIMARY KEY (Msg_no, Send_Uno),
    FOREIGN KEY (Msg_no) REFERENCES Message(Msg_no),
    FOREIGN KEY (Send_Uno) REFERENCES User(Uno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息发送表';

-- 创建消息接收表
CREATE TABLE Msg_Receive (
    Msg_no VARCHAR(20) NOT NULL COMMENT '消息编号',
    Receive_Uno VARCHAR(10) NOT NULL COMMENT '接收用户编号',
    Receive_time DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00' COMMENT '接收时间: 接收端显示后更新为当前系统时间, 且收回修改权限',
    Receive_haveread BOOLEAN NOT NULL DEFAULT false COMMENT '接收是否已读: 默认为false, 接收端显示后更新为true, 且收回修改权限',
    Receive_display BOOLEAN NOT NULL DEFAULT true COMMENT '接收展示: 默认为true, 接收端"删除"该信息后更新为false, 且收回修改权限',
    PRIMARY KEY (Msg_no, Receive_Uno),
    FOREIGN KEY (Msg_no) REFERENCES Message(Msg_no),
    FOREIGN KEY (Receive_Uno) REFERENCES User(Uno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息接收表';

CREATE TABLE Curricular_isOpen (
    Semeno VARCHAR(10) NOT NULL COMMENT '学期编号',
    Curricular_isOpen BOOLEAN NOT NULL DEFAULT false COMMENT '课程申请业务是否开放：由学校教务处管理员控制',
    PRIMARY KEY (Semeno),
    FOREIGN KEY (Semeno) REFERENCES Semester(Seme_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程申请业务是否开放：由学校教务处管理员控制';

CREATE TABLE Course_isOpen (
    Semeno VARCHAR(10) NOT NULL COMMENT '学期编号',
    Course_isOpen BOOLEAN NOT NULL DEFAULT false COMMENT '课申请业务是否开放：由学校教务处管理员控制',
    PRIMARY KEY (Semeno),
    FOREIGN KEY (Semeno) REFERENCES Semester(Seme_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课申请业务是否开放：由学校教务处管理员控制';

CREATE TABLE Enroll_isOpen (
    Semeno VARCHAR(10) NOT NULL COMMENT '学期编号',
    Enroll_isOpen BOOLEAN NOT NULL DEFAULT false COMMENT '选课业务是否开放：由学校教务处管理员控制',
    PRIMARY KEY (Semeno),
    FOREIGN KEY (Semeno) REFERENCES Semester(Seme_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选课业务是否开放：由学校教务处管理员控制';

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
