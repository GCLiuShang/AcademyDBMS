/**
 * 集中式角色导航配置
 * 仪表盘和侧边菜单从此文件读取同一数据源。
 */

/** 后端 Urole 值到配置键名的映射 */
const UROLE_TO_KEY = {
  'student': 'student',
  'Student': 'student',
  '学生': 'student',

  'professor': 'professor',
  'Professor': 'professor',
  '教授': 'professor',
  'Teacher': 'professor',

  'deptadmin': 'deptadmin',
  'DeptAdmin': 'deptadmin',
  '学院教学办': 'deptadmin',
  '学院教学办管理员': 'deptadmin',

  'univadmin': 'univadmin',
  'UnivAdmin': 'univadmin',
  '学校教务处': 'univadmin',
  '学校教务处管理员': 'univadmin',
};

/** 角色配置键名到菜单显示名的映射 */
const ROLE_KEY_TO_LABEL = {
  student: '学生',
  professor: '教授',
  deptadmin: '学院教学办管理员',
  univadmin: '学校教务处管理员',
};

const NAV_ITEMS = {
  student: {
    systemRole: '学生',
    queryItems: [
      { id: 'student-query-course',    label: '课程安排', icon: '/images/dashboard/course.svg' },
      { id: 'student-query-tp',        label: '培养方案', icon: '/images/dashboard/trainingprogram.svg' },
      { id: 'student-query-grade',     label: '成绩查询', icon: '/images/dashboard/grade.svg' },
      { id: 'student-query-exam',      label: '考试安排', icon: '/images/dashboard/exam.svg' },
      { id: 'student-query-classroom', label: '教室查询', icon: '/images/dashboard/classroom.svg' },
    ],
    businessItems: [
      { id: 'student-biz-account', label: '账户设置', icon: '/images/dashboard/account.svg', url: '/accountsettings' },
      { id: 'student-biz-enroll',  label: '选择课程', icon: '/images/dashboard/enroll.svg',  url: '/enroll' },
      { id: 'student-biz-delay',   label: '缓考申请', icon: '/images/dashboard/delay.svg' },
    ],
  },
  professor: {
    systemRole: '教授',
    queryItems: [],
    businessItems: [
      { id: 'professor-biz-account',           label: '账户设置',   icon: '/images/dashboard/account.svg',           url: '/accountsettings' },
      { id: 'professor-biz-curricularapply',    label: '开课申请',   icon: '/images/dashboard/curricularapply.svg',    url: '/curricularapply' },
      { id: 'professor-biz-courseapply',        label: '任教申请',   icon: '/images/dashboard/courseapply.svg',        url: '/courseapply' },
      { id: 'professor-biz-courseajust',        label: '任课调整',   icon: '/images/dashboard/courseajust.svg',        url: '/courseajust' },
      { id: 'professor-biz-gradeinput',         label: '成绩录入',   icon: '/images/dashboard/gradeinput.svg',         url: '/gradeinput' },
    ],
  },
  deptadmin: {
    systemRole: '学院教学办管理员',
    queryItems: [],
    businessItems: [
      { id: 'deptadmin-biz-account',            label: '账户设置',   icon: '/images/dashboard/account.svg',            url: '/accountsettings' },
      { id: 'deptadmin-biz-curricularapply',     label: '开课申请',   icon: '/images/dashboard/curricularapply.svg',     url: '/curricularapply' },
      { id: 'deptadmin-biz-curricularapprove',   label: '开课审批',   icon: '/images/dashboard/curricularapprove.svg',   url: '/curricularapprove' },
      { id: 'deptadmin-biz-examapply',           label: '考试申请',   icon: '/images/dashboard/exam.svg',                  url: '/examapply' },
      { id: 'deptadmin-biz-examarrange',         label: '考试安排',   icon: '/images/dashboard/examarrange.svg',           url: '/examarrange' },
      { id: 'deptadmin-biz-trainingprogramedit', label: '编写方案',   icon: '/images/dashboard/trainingprogram.svg',       url: '/trainingprogramedit' },
    ],
  },
  univadmin: {
    systemRole: '学校教务处管理员',
    queryItems: [],
    businessItems: [
      { id: 'univadmin-biz-account',            label: '账户设置',   icon: '/images/dashboard/account.svg',            url: '/accountsettings' },
      { id: 'univadmin-biz-curricularapprove',   label: '开课审批',   icon: '/images/dashboard/curricularapprove.svg',   url: '/curricularapprove' },
      { id: 'univadmin-biz-arrange',             label: '事务安排',   icon: '/images/dashboard/arrange.svg',            url: '/arrange' },
      { id: 'univadmin-biz-useradd',             label: '用户新增',   icon: '/images/dashboard/useradd.svg',            url: '/useradd' },
      { id: 'univadmin-biz-control',             label: '业务控制',   icon: '/images/dashboard/control.svg',            url: '/control' },
    ],
  },
};

export function roleKeyFromUrole(uRole) {
  if (!uRole) return undefined;
  return UROLE_TO_KEY[uRole];
}

export function getNavItemsByRole(roleKey) {
  const data = NAV_ITEMS[roleKey];
  if (!data) {
    return { systemRole: '通用', queryItems: [], businessItems: [] };
  }
  return data;
}

export function getNavItemsByUrole(uRole) {
  return getNavItemsByRole(roleKeyFromUrole(uRole));
}

export function getRoleLabel(roleKey) {
  return ROLE_KEY_TO_LABEL[roleKey] || '通用';
}

export { NAV_ITEMS, UROLE_TO_KEY };
