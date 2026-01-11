-- 创建实体表
-- 注意：执行顺序很重要，需要先创建被引用的表

-- 创建部门表
CREATE TABLE Department (
    Dept_no VARCHAR(2) NOT NULL COMMENT '学院编号: Dept_name的二字简写的拼音首字母大写, ex: XJ(信计)',
    Dept_name VARCHAR(20) NOT NULL COMMENT '学院名称',
    Dept_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '学院状态',
    PRIMARY KEY (Dept_no),
    CHECK (Dept_no REGEXP '^[A-Z]{2}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门表: 存储学院信息';

-- 创建专业表
CREATE TABLE Domain (
    Dom_no VARCHAR(4) NOT NULL COMMENT '专业编号: Dom_dept(2) + Dom_number(转16进制对应的2位字符串), ex: XJ02',
    Dom_dept VARCHAR(2) NOT NULL COMMENT '专业学院',
    Dom_number INT NOT NULL COMMENT '号码: 0~255, 同Dom_dept下递增',
    Dom_name VARCHAR(20) NOT NULL COMMENT '专业名称',
    Dom_shortname VARCHAR(8) NOT NULL COMMENT '专业名称缩写: 唯一键(UK)',
    Dom_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '专业状态: 若为"正常"，注意与Dom_dept级联更新"关闭"',
    PRIMARY KEY (Dom_no),
    FOREIGN KEY (Dom_dept) REFERENCES Department(Dept_no),
    UNIQUE KEY (Dom_shortname),
    CHECK (Dom_no REGEXP '^[A-Z]{2}[0-9A-F]{2}$'),
    CHECK (Dom_number BETWEEN 0 AND 255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='专业表: 存储专业信息';

-- 创建培养方案表
CREATE TABLE TrainingProgram (
    TPno VARCHAR(11) NOT NULL COMMENT '培养方案编号: "TP" + TPdom(4) + "-" +TPyear(4)',
    TPdom VARCHAR(4) NOT NULL COMMENT '培养方案专业',
    TPyear YEAR NOT NULL COMMENT '培养方案更新年份',
    TPname VARCHAR(52) NOT NULL COMMENT '培养方案名称: TPdom->Domain.Dom_dept->Department.Dept_name + TPdom->Domain.Dom_name + "培养方案（" + Tpyear + "年版）"',
    TPcredit_GB TINYINT NOT NULL DEFAULT 0 COMMENT '方案公共必修学分要求',
    TPcredit_ZB TINYINT NOT NULL DEFAULT 0 COMMENT '方案专业必修学分要求',
    TPcredit_ZX TINYINT NOT NULL DEFAULT 0 COMMENT '方案专业选修学分要求',
    TPcredit_TX TINYINT NOT NULL DEFAULT 0 COMMENT '方案通识选修学分要求',
    TPcredit_GX TINYINT NOT NULL DEFAULT 0 COMMENT '方案个性课程学分要求',
    TPstatus ENUM('可使用', '调整中', '已停用') NOT NULL DEFAULT '调整中' COMMENT '培养方案状态: 若为"可使用"，注意有相同专业年份更大的实体加入时更新或与TPdom级联更新"已停用"，更新为"关闭"后收回所有用户修改权限',
    PRIMARY KEY (TPno),
    FOREIGN KEY (TPdom) REFERENCES Domain(Dom_no),
    CHECK (TPno REGEXP '^TP[A-Z]{2}[0-9A-F]{2}-[0-9]{4}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培养方案表: 存储各专业培养方案信息';

-- 创建班级表
CREATE TABLE Class (
    Class_name VARCHAR(10) NOT NULL COMMENT '班级名称: Class_dom(4) + Class_attri(对应的英文, 2) + Class_year(2) + Class_number(转16进制对应的2位字符串)',
    Class_dom VARCHAR(4) NOT NULL COMMENT '班级所属专业',
    Class_attri ENUM('普通', '卓越', '实验') NOT NULL DEFAULT '普通' COMMENT '班级性质: ["普通"(null) | "卓越"("zy") | "实验"("sy") ]',
    Class_year VARCHAR(2) NOT NULL COMMENT '班级所属年级: 选择系统时间中年份的后两位, ex: "23"',
    Class_number INT NOT NULL COMMENT '号码: 0~255, 同(Class_dom + Class_attri + Class_year)下递增',
    Class_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '班级状态: 若为"正常"，注意与Class_dom级联更新"关闭"，更新为"关闭"后收回所有用户修改权限',
    PRIMARY KEY (Class_name),
    FOREIGN KEY (Class_dom) REFERENCES Domain(Dom_no),
    CHECK (Class_name REGEXP '^[A-Z]{2}[0-9A-F]{2}(zy|sy)?[0-9]{2}[0-9A-F]{2}$'),
    CHECK (Class_year REGEXP '^[0-9]{2}$'),
    CHECK (Class_number BETWEEN 0 AND 255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='班级表: 存储班级信息';

-- 创建校区表
CREATE TABLE Campus (
    Cam_name VARCHAR(8) NOT NULL COMMENT '校区名称',
    Cam_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '校区状态',
    PRIMARY KEY (Cam_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='校区表: 存储校区信息';

-- 创建楼栋表
CREATE TABLE Building (
    Bd_name VARCHAR(18) NOT NULL COMMENT '楼栋名称: Bd_cam(8) + Bd_shortname(10), ex: 南湖南博学东楼',
    Bd_cam VARCHAR(8) NOT NULL COMMENT '楼栋校区',
    Bd_shortname VARCHAR(10) NOT NULL COMMENT '楼栋在校区中名称',
    Bd_attri ENUM('常规楼', '综合楼') NOT NULL DEFAULT '常规楼' COMMENT '楼栋性质: 用于规范楼栋内教室命名',
    Bd_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '楼栋状态: 若为"正常"，注意与Bd_cam级联更新"关闭"',
    PRIMARY KEY (Bd_name),
    FOREIGN KEY (Bd_cam) REFERENCES Campus(Cam_name),
    CHECK (Bd_name REGEXP '^.{1,18}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='楼栋表: 存储楼栋信息';

-- 创建教室表
CREATE TABLE Classroom (
    Clrm_name VARCHAR(30) NOT NULL COMMENT '教室名称: Clrm_bd(18) + Clrm_floor(2) + Clrm_shortname(10), ex: 南湖南博学东楼104',
    Clrm_bd VARCHAR(18) NOT NULL COMMENT '教室楼栋名称',
    Clrm_floor VARCHAR(2) DEFAULT NULL COMMENT '教室楼层: ex: 1(常规楼，只有1~9层) 或 03(常规楼，可以有两位数楼层和负数楼层) 或 1F(综合楼，可以有两位数楼层和负数楼层)',
    Clrm_shortname VARCHAR(10) NOT NULL COMMENT '教室在楼层中编号/名称: ex: 03(常规楼) 或 大厅(综合楼)',
    Clrm_capacity TINYINT NOT NULL COMMENT '教室容量',
    Clrm_status ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '教室状态: 若为"正常"，注意与Clrm_bd级联更新"关闭"',
    PRIMARY KEY (Clrm_name),
    FOREIGN KEY (Clrm_bd) REFERENCES Building(Bd_name),
    CHECK (Clrm_capacity > 0),
    CHECK (Clrm_name REGEXP '^.{1,30}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教室表: 存储教室信息';

-- 创建学期表
CREATE TABLE Semester (
    Seme_no VARCHAR(5) NOT NULL COMMENT '学年学期编号: Seme_year(4, 转VARCHAR) + Seme_sequence(1)',
    Seme_year YEAR NOT NULL COMMENT '学年: 自动生成，只允许编辑未开始的下一个学期',
    Seme_sequence ENUM('1', '2') NOT NULL COMMENT '学期顺序: ["1" | "2" ] 自动生成，只允许编辑未开始的下一个学期',
    Week_max TINYINT NOT NULL COMMENT '最大周数: 0 ~ 34',
    PRIMARY KEY (Seme_no),
    CHECK (Seme_no REGEXP '^[0-9]{4}[1-2]$'),
    CHECK (Week_max BETWEEN 0 AND 34)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学期表: 1. 每学期开学一个月前确认该学期最大周数 2. 设置提醒更新业务';

-- 创建星期表
CREATE TABLE Dayofweek (
    Day ENUM('1', '2', '3', '4', '5', '6', '7') NOT NULL COMMENT '星期',
    PRIMARY KEY (Day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='星期表: 存储星期信息';

-- 创建日期表
CREATE TABLE Date (
    Date_no VARCHAR(10) NOT NULL COMMENT '日期编号: DATE转VARCHAR("yyyy-mm-dd")，自动生成，只允许编辑未开始的下一个学期',
    Date_seme VARCHAR(5) NOT NULL COMMENT '日期所属学期',
    Date_week TINYINT NOT NULL COMMENT '日期所属周数',
    Date_dayofweek ENUM('1', '2', '3', '4', '5', '6', '7') NOT NULL COMMENT '日期星期',
    Date_type ENUM('工作日', '休息日', '节假日', '调休日') NOT NULL DEFAULT '工作日' COMMENT '日期类型',
    Date_holiday VARCHAR(20) DEFAULT NULL COMMENT '日期节假日名称: 若Date_daytype != "节假日"，则为null，否则需输入',
    Date_description VARCHAR(20) DEFAULT NULL COMMENT '日期描述',
    PRIMARY KEY (Date_no),
    FOREIGN KEY (Date_seme) REFERENCES Semester(Seme_no),
    FOREIGN KEY (Date_dayofweek) REFERENCES Dayofweek(Day),
    CHECK (Date_no REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日期表: 与Semester一起编辑';

-- 创建课节表
CREATE TABLE Lesson (
    Lno ENUM('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13') NOT NULL COMMENT '课节编号',
    Ltime_begin TIME NOT NULL COMMENT '课节开始时间: [ 8:00 | 8:50 | 9:55 | 10:45 | 11:35 | 14:00 | 14:50 | 15:40 | 16:45 | 17:35 | 19:00 | 19:50 | 20:40 ]',
    Ltime_end TIME NOT NULL COMMENT '课节结束时间: Ltime_begin + 45min',
    PRIMARY KEY (Lno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课节表: 记录课节与时间对应关系';

-- 创建用户表
CREATE TABLE User (
    Uno VARCHAR(10) NOT NULL COMMENT '用户编号: 根据角色对应不同表的序号',
    Upswd VARCHAR(255) NOT NULL COMMENT '用户密码: 加密存储的密码',
    Urole ENUM('学生', '教授', '学院教学办管理员', '学校教务处管理员', '其他人员') NOT NULL COMMENT '用户角色',
    Utime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '用户注册时间: 创建时系统时间',
    Ustatus ENUM('离线', '在线', '锁定') NOT NULL DEFAULT '离线' COMMENT '用户登录状态: 若为"锁定"且当前系统时间距离用户最后尝试登录时间>=1min, 则更新为"离线", 且将Ulosetimes更新为0',
    Ulasttrytime DATETIME NOT NULL DEFAULT '1000-01-01 00:00:00' COMMENT '用户最后尝试登录时间: 最后尝试登录的系统时间',
    Ulosetimes INT NOT NULL DEFAULT 0 COMMENT '用户登录失败次数: 每次登录失败后加1，最大为5，若失败次数为5，则将Ustatus更新为"锁定"',
    PRIMARY KEY (Uno),
    CHECK (Ulosetimes BETWEEN 0 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表: 存储所有用户基本信息';

-- 创建会话表
CREATE TABLE User_Session (
    Sid CHAR(64) NOT NULL COMMENT '会话ID: 64位hex字符串',
    Uno VARCHAR(10) NOT NULL COMMENT '用户编号',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话创建时间',
    LastSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近活跃时间',
    ExpiresAt DATETIME NOT NULL COMMENT '会话过期时间',
    Ip VARCHAR(64) DEFAULT NULL COMMENT '客户端IP(可选)',
    Ua VARCHAR(255) DEFAULT NULL COMMENT '客户端User-Agent(可选)',
    Revoked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已注销',
    PRIMARY KEY (Sid),
    KEY idx_user_session_uno (Uno),
    KEY idx_user_session_expires (ExpiresAt),
    FOREIGN KEY (Uno) REFERENCES User(Uno) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录会话表: 服务端会话存储';

-- 创建学生表
CREATE TABLE Student (
    Sno VARCHAR(10) NOT NULL COMMENT '学生学号: "S" + Syear(4) + Snumber(转16进制对应的5位字符串), ex: S202505FA1',
    Syear YEAR NOT NULL COMMENT '入学年份',
    Snumber INT NOT NULL COMMENT '号码: 0~16^5-1, 同Syear下递增',
    Sname VARCHAR(20) NOT NULL COMMENT '学生姓名: 更新为"退学"或"毕业"后收回所有用户修改权限',
    Ssex ENUM('男', '女') NOT NULL COMMENT '学生性别: 更新为"退学"或"毕业"后收回所有用户修改权限',
    Sclass VARCHAR(10) DEFAULT NULL COMMENT '学生班级: 更新为"退学"或"毕业"后收回所有用户修改权限',
    Sstatus ENUM('在读', '调整', '休学', '退学', '毕业') NOT NULL DEFAULT '在读' COMMENT '学生状态: 若为"在读"或"休学"，注意Sclass状态变更后级联更新为"调整"，将Sclass更新为空，然后发送消息给负责人处理，结束后返回原状态，更新为"退学"或"毕业"后收回所有用户修改权限',
    PRIMARY KEY (Sno),
    FOREIGN KEY (Sno) REFERENCES User(Uno),
    FOREIGN KEY (Sclass) REFERENCES Class(Class_name),
    CHECK (Sno REGEXP '^S[0-9]{4}[0-9A-F]{5}$'),
    CHECK (Snumber BETWEEN 0 AND 1048575) -- 16^5-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生表: 存储学生详细信息';

-- 创建教授表
CREATE TABLE Professor (
    Pno VARCHAR(10) NOT NULL COMMENT '教授编号: "P" + Pyear(4) + Pnumber(转16进制对应的5位字符串), ex: P2021010A5',
    Pyear YEAR NOT NULL COMMENT '入职年份',
    Pnumber INT NOT NULL COMMENT '号码: 0~16^5-1, 同Pyear下递增',
    Pname VARCHAR(20) NOT NULL COMMENT '教授姓名: 更新为"离职"后收回所有用户修改权限',
    Psex ENUM('男', '女') NOT NULL COMMENT '教授性别: 更新为"离职"后收回所有用户修改权限',
    Ptitle ENUM('教授', '副教授', '讲师', '研究员') NOT NULL COMMENT '教授职称: 更新为"离职"后收回所有用户修改权限',
    Pdept VARCHAR(2) DEFAULT NULL COMMENT '教授学院: 更新为"离职"后收回所有用户修改权限',
    Poffice VARCHAR(10) DEFAULT NULL COMMENT '教授办公室: 更新为"离职"后收回所有用户修改权限',
    Pstatus ENUM('在职', '调整', '离职') NOT NULL DEFAULT '在职' COMMENT '教授状态: 若为"在职"，注意Pdept状态变更后级联更新为"调整"，将Pdept更新为空，然后发送消息给负责人处理，结束后返回原状态，更新为"离职"后收回所有用户修改权限',
    PRIMARY KEY (Pno),
    FOREIGN KEY (Pno) REFERENCES User(Uno),
    FOREIGN KEY (Pdept) REFERENCES Department(Dept_no),
    CHECK (Pno REGEXP '^P[0-9]{4}[0-9A-F]{5}$'),
    CHECK (Pnumber BETWEEN 0 AND 1048575) -- 16^5-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教授表: 存储教授详细信息';

-- 创建学院教学办管理员表
CREATE TABLE Dept_Adm (
    DAno VARCHAR(10) NOT NULL COMMENT '学院教学办管理员编号: "DA" + DAyear(4) + DAnumber(转16进制对应的4位字符串), ex: DA201900A1',
    DAyear YEAR NOT NULL COMMENT '入职年份',
    DAnumber INT NOT NULL COMMENT '号码: 0~16^4-1, 同DAyear下递增',
    DAdept VARCHAR(2) NOT NULL COMMENT '学院教学办管理员学院: 更新为"离职"后收回所有用户修改权限',
    DAname VARCHAR(20) NOT NULL COMMENT '学院教学办管理员姓名: 更新为"离职"后收回所有用户修改权限',
    DAstatus ENUM('在职', '调整', '离职') NOT NULL DEFAULT '在职' COMMENT '学院教学办管理员状态: 若为"在职"，注意DAdept状态变更后级联更新为"调整"，将DAdept更新为空，然后发送消息给负责人处理，结束后返回原状态，更新为"离职"后收回所有用户修改权限',
    PRIMARY KEY (DAno),
    FOREIGN KEY (DAno) REFERENCES User(Uno),
    FOREIGN KEY (DAdept) REFERENCES Department(Dept_no),
    CHECK (DAno REGEXP '^DA[0-9]{4}[0-9A-F]{4}$'),
    CHECK (DAnumber BETWEEN 0 AND 65535) -- 16^4-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学院教学办管理员表: 存储学院教学办管理员信息';

-- 创建学校教务处管理员表
CREATE TABLE Univ_Adm (
    UAno VARCHAR(10) NOT NULL COMMENT '学校教务处管理员编号: "UA" + UAyear(4) + UAnumber(转16进制对应的4位字符串), ex: UA201900A1',
    UAyear YEAR NOT NULL COMMENT '入职年份',
    UAnumber INT NOT NULL COMMENT '号码: 0~16^4-1, 同UAyear递增',
    UAname VARCHAR(20) NOT NULL COMMENT '学校教务处管理员姓名: 更新为"离职"后收回所有用户修改权限',
    UAstatus ENUM('在职', '调整', '离职') NOT NULL DEFAULT '在职' COMMENT '学校教务处管理员状态',
    PRIMARY KEY (UAno),
    FOREIGN KEY (UAno) REFERENCES User(Uno),
    CHECK (UAno REGEXP '^UA[0-9]{4}[0-9A-F]{4}$'),
    CHECK (UAnumber BETWEEN 0 AND 65535) -- 16^4-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学校教务处管理员表: 存储学校教务处管理员信息';

-- 创建其他人员表
CREATE TABLE Other (
    Ono VARCHAR(10) NOT NULL COMMENT '其他人员编号: "O" + Oyear(4) + Onumber(转16进制对应的5位字符串), ex: O2024000B2',
    Oyear YEAR NOT NULL COMMENT '入职年份',
    Onumber INT NOT NULL COMMENT '号码: 0~16^5-1, 同Oyear下递增',
    Oname VARCHAR(20) NOT NULL COMMENT '其他人员姓名',
    Odescription VARCHAR(50) NOT NULL COMMENT '其他人员描述',
    PRIMARY KEY (Ono),
    CHECK (Ono REGEXP '^O[0-9]{4}[0-9A-F]{5}$'),
    CHECK (Onumber BETWEEN 0 AND 1048575) -- 16^5-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='其他人员表: 存储其他人员信息';

-- 创建课程编号池表
CREATE TABLE Cno_Pool (
    Cno VARCHAR(10) NOT NULL COMMENT '课程编号: "C" + Cattri(对应的2位字符串) + Cdept(2) + Cseme(对应的2位字符串) + Cnumber(转16进制对应的3位字符串), ex: CGBLX0200B',
    Cattri ENUM('公共必修','专业必修','专业选修','通识选修','个性课程') NOT NULL COMMENT '课程性质: ["公共必修"(GB) | "专业必修"(ZB) | "专业选修"(ZX) | "通识选修"(TX) | "个性课程"(GX)]',
    Cdept VARCHAR(2) NOT NULL COMMENT '课程开设学院',
    Cseme ENUM('第一学期','第二学期','第三学期','第四学期','第五学期','第六学期','第七学期','第八学期','第九学期','第十学期','第十一学期','第十二学期','第一和第二学期','第三和第四学期','第五和第六学期','第七和第八学期','第九和第十学期','第十一和第十二学期','奇数学期','偶数学期','任意学期') NOT NULL COMMENT '课程开设学期',
    Cnumber INT NOT NULL COMMENT '号码: 在同(Cattri+Cdept+Cseme)下递增, 0~16^3-1',
    Cno_status ENUM('可用','正在调整','不可用') NOT NULL DEFAULT '可用' COMMENT '编号状态: 若修改为"可用"(来自Setup_Curricular(类)的级联修改)，级联修改同Cno的Curricualr状态为"关闭"(对于之前完成开课但当前学期无法开课的通识选修或个性课程)',
    PRIMARY KEY (Cno),
    FOREIGN KEY (Cdept) REFERENCES Department(Dept_no),
    CHECK (Cno REGEXP '^C[A-Z]{2}[A-Z]{2}[0-9A-F]{2}[0-9A-F]{3}$'),
    CHECK (Cnumber BETWEEN 0 AND 4095) -- 16^3-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程编号池表: 由Setup_Curricular(类)业务使用';

-- 创建课程基础表
CREATE TABLE Curricular (
    Cno VARCHAR(10) NOT NULL COMMENT '课程编号',
    Cname VARCHAR(20) NOT NULL COMMENT '课程名称',
    Ccredit TINYINT NOT NULL DEFAULT 0 COMMENT '课程学分',
    C_classhour INT NOT NULL COMMENT '课程课时',
    C_eattri ENUM('无', '大作业', '线上', '线下开卷', '线下闭卷') NOT NULL DEFAULT '无' COMMENT '课程考核性质',
    Cdescription VARCHAR(50) DEFAULT NULL COMMENT '课程描述',
    Cstatus ENUM('正常', '正在关闭', '关闭') NOT NULL DEFAULT '正常' COMMENT '课程状态',
    PRIMARY KEY (Cno),
    FOREIGN KEY (Cno) REFERENCES Cno_Pool(Cno),
    CHECK (Cno REGEXP '^C[A-Z]{2}[A-Z]{2}[0-9A-F]{2}[0-9A-F]{3}$'), -- 根据Cno_Pool规则
    CHECK (C_classhour > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程基础表: 存储课程基本信息';

-- 创建课程表
CREATE TABLE Course (
    Cour_no VARCHAR(20) NOT NULL COMMENT '课编号: Cour_cno(10) + "-" + Cour_semeno(5) + "-" + Cour_number(转16进制对应的3位字符串), ex: CGBLX0200B-20252-05C',
    Cour_cno VARCHAR(10) NOT NULL COMMENT '课对应课程编号',
    Cour_seme VARCHAR(5) NOT NULL COMMENT '课开设学期编号',
    Cour_number INT NOT NULL COMMENT '号码: 0~16^3-1, 同(Cour_cno+Cour_semeno)下递增，不回收',
    Cour_pmax TINYINT NOT NULL COMMENT '课最大人数',
    Cour_pnow TINYINT NOT NULL DEFAULT 0 COMMENT '课当前人数',
    Cour_status ENUM('未开始', '进行中', '已关闭', '已结束') NOT NULL DEFAULT '未开始' COMMENT '课状态: 要求有关Department状态的更新只能在假期进行，故不会影响',
    PRIMARY KEY (Cour_no),
    FOREIGN KEY (Cour_cno) REFERENCES Curricular(Cno),
    FOREIGN KEY (Cour_seme) REFERENCES Semester(Seme_no),
    CHECK (Cour_no REGEXP '^[A-Z0-9]{10}-[0-9]{5}-[0-9A-F]{3}$'),
    CHECK (Cour_pmax BETWEEN 1 AND 120),
    CHECK (Cour_pnow BETWEEN 0 AND Cour_pmax),
    CHECK (Cour_number BETWEEN 0 AND 4095) -- 16^3-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表: 存储每学期开设的具体课程信息';

-- 创建考试表
CREATE TABLE Exam (
    Eno VARCHAR(10) NOT NULL COMMENT '考试编号',
    E_cno VARCHAR(10) NOT NULL COMMENT '开设考试课程编号',
    Eattri ENUM('正考', '补缓考', '其他') NOT NULL COMMENT '考试性质: ["正考" | "补缓考" | "其他" ]',
    Estatus ENUM('未开始', '调整中', '进行中', '已结束', '已取消') NOT NULL DEFAULT '未开始' COMMENT '考试状态: 更新为"已结束"或"已取消"后收回所有用户修改权限',
    PRIMARY KEY (Eno),
    FOREIGN KEY (E_cno) REFERENCES Curricular(Cno),
    CHECK (Eno REGEXP '^E[0-9]{5}[0-9A-F]{3}[ZHT]$'),
    CHECK (Eattri IN ('正考', '补缓考', '其他'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考试表: 存储考试信息';

-- 创建消息表
CREATE TABLE Message (
    Msg_no VARCHAR(20) NOT NULL COMMENT '消息编号: "MSG" + Msg_date(转8位字符串, yyyymmdd) + Msg_number(转16进制对应的9位字符串)',
    Msg_date DATE NOT NULL COMMENT '消息日期: 创建时系统时间',
    Msg_number BIGINT NOT NULL COMMENT '号码: 0~16^9-1, 同Msg_date下递增',
    Msg_category ENUM('通知', '代办', '系统', '撤回') NOT NULL COMMENT '消息类别',
    Msg_wdMsgno VARCHAR(20) DEFAULT NULL COMMENT '撤回消息编号: 范围: 用户自己发出的消息, 且Msg_category != "撤回"',
    Msg_priority ENUM('一般', '重要') NOT NULL DEFAULT '一般' COMMENT '消息优先级: 若Msg_category为"撤回"，则优先级与被撤回的消息相同',
    Msg_content VARCHAR(511) NOT NULL COMMENT '消息内容: 若Msg_category为"撤回"，则内容强制为"撤回编号为…的消息"',
    PRIMARY KEY (Msg_no),
    FOREIGN KEY (Msg_wdMsgno) REFERENCES Message(Msg_no),
    CHECK (Msg_no REGEXP '^MSG[0-9]{8}[0-9A-F]{9}$'),
    CHECK (Msg_number BETWEEN 0 AND 68719476735) -- 16^9-1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息表: 存储消息信息';
