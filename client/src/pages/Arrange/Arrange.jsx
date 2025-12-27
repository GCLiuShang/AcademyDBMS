import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import Table from '../../components/Table/Table';
import Details from '../../components/Details/Details';
import { getCurrentUserFromStorage } from '../../utils/userSession';
import './Arrange.css';

const API_BASE = '';
const LESSON_NO_OPTIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];

function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) return dt;
  const normalized = String(value).replace(' ', 'T');
  const dt2 = new Date(normalized);
  return Number.isNaN(dt2.getTime()) ? null : dt2;
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function formatDateTimeDisplay(dt) {
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const d = pad2(dt.getDate());
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function formatDateOnly(dt) {
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const d = pad2(dt.getDate());
  return `${y}-${m}-${d}`;
}

function intervalsOverlap(aBegin, aEnd, bBegin, bEnd) {
  if (!aBegin || !aEnd || !bBegin || !bEnd) return false;
  return aBegin < bEnd && aEnd > bBegin;
}

const Arrange = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);

  const [txnDropdownOpen, setTxnDropdownOpen] = useState(false);
  const [txnQuery, setTxnQuery] = useState('');
  const [txnOptions, setTxnOptions] = useState([]);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const txnDropdownRef = useRef(null);
  const txnSearchTimerRef = useRef(null);

  const [lessonTimes, setLessonTimes] = useState({});

  const [setupCourse, setSetupCourse] = useState(null);
  const [setupCourseDays, setSetupCourseDays] = useState([]);
  const [courseSeme, setCourseSeme] = useState('');
  const [curricularClasshour, setCurricularClasshour] = useState(null);

  const [courseSelectedDay, setCourseSelectedDay] = useState('');
  const [coursePerSessionLessons, setCoursePerSessionLessons] = useState('');
  const [activeWeek, setActiveWeek] = useState(1);
  const [selectedLessonsByWeek, setSelectedLessonsByWeek] = useState({});
  const [selectedClassroomByWeek, setSelectedClassroomByWeek] = useState({});
  const [courseLeftMessage, setCourseLeftMessage] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [weekDropdownOpen, setWeekDropdownOpen] = useState(false);
  const weekDropdownRef = useRef(null);

  const [setupExam, setSetupExam] = useState(null);
  const [examBegin, setExamBegin] = useState(null);
  const [examEnd, setExamEnd] = useState(null);
  const [examPeopleTerms, setExamPeopleTerms] = useState([]);
  const [examPeopleSum, setExamPeopleSum] = useState(0);
  const [selectedExamRooms, setSelectedExamRooms] = useState([]);
  const [examLeftMessage, setExamLeftMessage] = useState('');

  const [txnTableData, setTxnTableData] = useState([]);
  const [txnTableTotal, setTxnTableTotal] = useState(0);
  const [txnTablePage, setTxnTablePage] = useState(1);
  const [txnTablePageSize, setTxnTablePageSize] = useState(20);
  const [txnTableLoading, setTxnTableLoading] = useState(false);
  const [txnTableSearchParams, setTxnTableSearchParams] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const occupancyCacheRef = useRef(new Map());
  const dateCacheRef = useRef(new Map());
  const campusClassroomCacheRef = useRef(new Map());
  const allClassroomsCacheRef = useRef(null);

  useEffect(() => {
    const user = getCurrentUserFromStorage();
    if (user) {
      setUserInfo(user);
    } else {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (txnDropdownRef.current && !txnDropdownRef.current.contains(e.target)) setTxnDropdownOpen(false);
      if (weekDropdownRef.current && !weekDropdownRef.current.contains(e.target)) setWeekDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const fetchTable = useCallback(async (tableName, paramsObj) => {
    const params = new URLSearchParams({
      tableName,
      page: 1,
      limit: 200,
      ...paramsObj,
    });
    const res = await fetch(`${API_BASE}/api/common/table/list?${params.toString()}`);
    const json = await res.json();
    if (!json.success) return [];
    return json.data || [];
  }, []);

  useEffect(() => {
    const loadLessonTimes = async () => {
      try {
        const rows = await fetchTable('Lesson', { limit: 100, orderBy: 'Lno', orderDir: 'ASC' });
        const map = {};
        (rows || []).forEach((r) => {
          if (!r?.Lno) return;
          map[String(r.Lno)] = {
            begin: String(r.Ltime_begin || ''),
            end: String(r.Ltime_end || ''),
          };
        });
        setLessonTimes(map);
      } catch {
        setLessonTimes({});
      }
    };
    loadLessonTimes();
  }, [fetchTable]);

  const searchTransactions = useCallback(
    async (query) => {
      const q = query.trim();
      if (q.length < 5) return [];
      const [courseRows, examRows] = await Promise.all([
        fetchTable('Setup_Course', { limit: 50, orderBy: 'SetupCo_Courno', orderDir: 'ASC', [`search_SetupCo_Courno`]: q }),
        fetchTable('Setup_Exam', { limit: 50, orderBy: 'SetupE_ID', orderDir: 'DESC', [`search_SetupE_ID`]: q }),
      ]);

      const courses = (courseRows || [])
        .filter((r) => r?.SetupCo_status === '等待审核')
        .filter((r) => typeof r?.SetupCo_Courno === 'string' && r.SetupCo_Courno.includes(q))
        .map((r) => ({ type: 'course', id: r.SetupCo_Courno }));

      const exams = (examRows || [])
        .filter((r) => r?.SetupE_status === '等待审核')
        .filter((r) => typeof r?.SetupE_ID === 'string' && r.SetupE_ID.includes(q))
        .map((r) => ({ type: 'exam', id: r.SetupE_ID }));

      const seen = new Set();
      const merged = [...courses, ...exams].filter((opt) => {
        const key = `${opt.type}:${opt.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return merged.slice(0, 50);
    },
    [fetchTable]
  );

  useEffect(() => {
    if (!txnDropdownOpen) return;
    const q = txnQuery.trim();
    if (txnSearchTimerRef.current) clearTimeout(txnSearchTimerRef.current);
    txnSearchTimerRef.current = setTimeout(async () => {
      if (q.length < 5) {
        setTxnOptions([]);
        return;
      }
      try {
        const opts = await searchTransactions(q);
        setTxnOptions(opts);
      } catch {
        setTxnOptions([]);
      }
    }, 250);
    return () => {
      if (txnSearchTimerRef.current) clearTimeout(txnSearchTimerRef.current);
    };
  }, [txnDropdownOpen, txnQuery, searchTransactions]);

  const resetCourseState = useCallback(() => {
    setSetupCourse(null);
    setSetupCourseDays([]);
    setCourseSeme('');
    setCurricularClasshour(null);
    setCourseSelectedDay('');
    setCoursePerSessionLessons('');
    setAvailableWeeks([]);
    setSelectedWeeks([]);
    setActiveWeek(0);
    setSelectedLessonsByWeek({});
    setSelectedClassroomByWeek({});
    setCourseLeftMessage('');
  }, []);

  const resetExamState = useCallback(() => {
    setSetupExam(null);
    setExamBegin(null);
    setExamEnd(null);
    setExamPeopleTerms([]);
    setExamPeopleSum(0);
    setSelectedExamRooms([]);
    setExamLeftMessage('');
  }, []);

  useEffect(() => {
    resetCourseState();
    resetExamState();
    setSubmitLoading(false);
    setSubmitError('');
    setSubmitSuccess('');
    if (!selectedTxn?.type || !selectedTxn?.id) return;

    const run = async () => {
      if (selectedTxn.type === 'course') {
        const courno = selectedTxn.id;
        try {
          const [courseRows, dayRows] = await Promise.all([
            fetchTable('Setup_Course', { limit: 30, [`search_SetupCo_Courno`]: courno }),
            fetchTable('SetupCo_DofW', { limit: 200, orderBy: 'SetupCo_dayofweek', orderDir: 'ASC', [`search_SetupCo_Courno`]: courno }),
          ]);
          const row = (courseRows || []).find((r) => r?.SetupCo_Courno === courno) || null;
          setSetupCourse(row);
          const days = (dayRows || [])
            .filter((r) => r?.SetupCo_Courno === courno)
            .map((r) => String(r.SetupCo_dayofweek))
            .filter((d) => /^[1-7]$/.test(d));
          days.sort((a, b) => Number(a) - Number(b));
          setSetupCourseDays(Array.from(new Set(days)));

          const parts = String(courno).split('-');
          const cno = parts[0] || '';
          const seme = parts[1] || '';
          setCourseSeme(seme);
          if (cno) {
            const curricularRows = await fetchTable('Curricular', { limit: 50, [`search_Cno`]: cno });
            const cr = (curricularRows || []).find((r) => r?.Cno === cno);
            const ch = cr?.C_classhour ?? cr?.Cclasshour ?? null;
            const chNum = Number(ch);
            setCurricularClasshour(Number.isFinite(chNum) && chNum > 0 ? chNum : null);
          }
        } catch {
          setSetupCourse(null);
          setSetupCourseDays([]);
          setCurricularClasshour(null);
        }
      }

      if (selectedTxn.type === 'exam') {
        const setupEId = selectedTxn.id;
        try {
          const rows = await fetchTable('Setup_Exam', { limit: 50, [`search_SetupE_ID`]: setupEId });
          const row = (rows || []).find((r) => r?.SetupE_ID === setupEId) || null;
          setSetupExam(row);
          const b = parseDateTime(row?.SetupE_Etime_begin);
          const e = parseDateTime(row?.SetupE_Etime_end);
          setExamBegin(b);
          setExamEnd(e);

          const cno = row?.SetupE_Cno;
          const seme = row?.SetupE_Esemeno;
          if (cno && seme) {
            const courseRows = await fetchTable('Course', {
              limit: 500,
              orderBy: 'Cour_no',
              orderDir: 'ASC',
              [`search_Cour_cno`]: cno,
              [`search_Cour_seme`]: seme,
            });
            const filtered = (courseRows || []).filter((r) => r?.Cour_cno === cno && r?.Cour_seme === seme);
            const terms = filtered.map((r) => Number(r?.Cour_pnow || 0)).filter((n) => Number.isFinite(n) && n >= 0);
            const sum = terms.reduce((acc, n) => acc + n, 0);
            setExamPeopleTerms(terms);
            setExamPeopleSum(sum);
          } else {
            setExamPeopleTerms([]);
            setExamPeopleSum(0);
          }
        } catch {
          setSetupExam(null);
          setExamBegin(null);
          setExamEnd(null);
          setExamPeopleTerms([]);
          setExamPeopleSum(0);
        }
      }
    };

    run();
  }, [fetchTable, resetCourseState, resetExamState, selectedTxn]);

  const courseWeekMeta = useMemo(() => {
    const totalRaw = Number(curricularClasshour);
    const perRaw = Number(coursePerSessionLessons);
    if (!Number.isFinite(totalRaw) || totalRaw <= 0 || !Number.isFinite(perRaw) || perRaw <= 0) {
      return {
        requiredWeeks: 0,
        total: 0,
        per: 0,
        quotient: 0,
        remainder: 0,
      };
    }
    const quotient = Math.floor(totalRaw / perRaw);
    const remainder = totalRaw - quotient * perRaw;
    const requiredWeeks = quotient + (remainder > 0 ? 1 : 0);
    return {
      requiredWeeks,
      total: totalRaw,
      per: perRaw,
      quotient,
      remainder,
    };
  }, [coursePerSessionLessons, curricularClasshour]);

  const { requiredWeeks, total: totalClasshour, per: perPerSession, quotient: weeksFull, remainder: lastWeekRemainder } = courseWeekMeta;

  const getDateInfoByWeekDay = useCallback(
    async (seme, day, week) => {
      if (!seme || !day || !week) return null;
      const key = `${seme}:${day}`;
      let map = dateCacheRef.current.get(key);
      if (!map) {
        const rows = await fetchTable('Date', { limit: 500, orderBy: 'Date_week', orderDir: 'ASC', [`search_Date_seme`]: seme, [`search_Date_dayofweek`]: day });
        map = new Map();
        (rows || [])
          .filter((r) => String(r?.Date_seme) === String(seme) && String(r?.Date_dayofweek) === String(day))
          .forEach((r) => {
            const w = Number(r?.Date_week);
            const dateNo = String(r?.Date_no || '');
            if (!Number.isFinite(w) || !dateNo) return;
            map.set(w, {
              dateNo,
              type: String(r?.Date_type || ''),
              holiday: String(r?.Date_holiday || ''),
            });
          });
        dateCacheRef.current.set(key, map);
      }
      const info = map.get(Number(week));
      if (!info) return null;
      return info;
    },
    [fetchTable]
  );

  useEffect(() => {
    if (!courseSeme || !courseSelectedDay) {
      setAvailableWeeks([]);
      setSelectedWeeks([]);
      setActiveWeek(0);
      return;
    }

    const loadWeeks = async () => {
      try {
        await getDateInfoByWeekDay(courseSeme, courseSelectedDay, 1);
        const key = `${courseSeme}:${courseSelectedDay}`;
        const map = dateCacheRef.current.get(key);
        if (!map) {
          setAvailableWeeks([]);
          setSelectedWeeks([]);
          setActiveWeek(0);
          return;
        }
        const weeks = Array.from(map.keys())
          .map((w) => Number(w))
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b);
        setAvailableWeeks(weeks);
        setSelectedWeeks((prev) => {
          if (!Array.isArray(prev)) return [];
          const filtered = prev.filter((w) => weeks.includes(w));
          if (!requiredWeeks || requiredWeeks <= 0) return [];
          const unique = Array.from(new Set(filtered)).sort((a, b) => a - b);
          if (unique.length > requiredWeeks) return unique.slice(0, requiredWeeks);
          return unique;
        });
      } catch {
        setAvailableWeeks([]);
        setSelectedWeeks([]);
        setActiveWeek(0);
      }
    };

    loadWeeks();
  }, [courseSeme, courseSelectedDay, getDateInfoByWeekDay, requiredWeeks]);

  useEffect(() => {
    if (!requiredWeeks || !Array.isArray(selectedWeeks) || selectedWeeks.length === 0) {
      setActiveWeek(0);
      return;
    }
    setActiveWeek((prev) => {
      if (selectedWeeks.includes(prev)) return prev;
      return selectedWeeks[0];
    });
  }, [requiredWeeks, selectedWeeks]);

  const fetchOccupancyByDate = useCallback(
    async (dateNo) => {
      if (!dateNo) return [];
      if (occupancyCacheRef.current.has(dateNo)) return occupancyCacheRef.current.get(dateNo) || [];
      const rows = await fetchTable('View_Classroom_Occupancy', { limit: 2000, [`search_Occ_date`]: dateNo });
      const filtered = (rows || []).filter((r) => String(r?.Occ_date).includes(String(dateNo)));
      occupancyCacheRef.current.set(dateNo, filtered);
      return filtered;
    },
    [fetchTable]
  );

  const fetchAllClassrooms = useCallback(async () => {
    if (allClassroomsCacheRef.current) return allClassroomsCacheRef.current;
    const rows = await fetchTable('Classroom', { limit: 2000, orderBy: 'Clrm_name', orderDir: 'ASC' });
    const rooms = (rows || []).filter((r) => r?.Clrm_status === '正常' && r?.Clrm_name);
    allClassroomsCacheRef.current = rooms;
    return rooms;
  }, [fetchTable]);

  const fetchCampusClassrooms = useCallback(
    async (campus) => {
      if (!campus) return [];
      if (campusClassroomCacheRef.current.has(campus)) return campusClassroomCacheRef.current.get(campus) || [];
      const buildingRows = await fetchTable('Building', { limit: 1000, [`search_Bd_cam`]: campus });
      const bdSet = new Set(
        (buildingRows || [])
          .filter((r) => String(r?.Bd_cam) === String(campus))
          .map((r) => r?.Bd_name)
          .filter(Boolean)
      );
      const allRooms = await fetchAllClassrooms();
      const rooms = (allRooms || []).filter((r) => bdSet.has(r?.Clrm_bd));
      campusClassroomCacheRef.current.set(campus, rooms);
      return rooms;
    },
    [fetchAllClassrooms, fetchTable]
  );

  const lessonIntervalsForDate = useCallback(
    (dateNo, lessonNos) => {
      if (!dateNo) return [];
      const list = (lessonNos || []).filter((l) => LESSON_NO_OPTIONS.includes(String(l)));
      return list
        .map((lno) => {
          const t = lessonTimes[String(lno)];
          if (!t?.begin || !t?.end) return null;
          const begin = parseDateTime(`${dateNo}T${t.begin}`);
          const end = parseDateTime(`${dateNo}T${t.end}`);
          if (!begin || !end) return null;
          return { begin, end, lno: String(lno) };
        })
        .filter(Boolean);
    },
    [lessonTimes]
  );

  const courseOccupiedRoomSet = useCallback(
    async (dateNo, lessonNos) => {
      const occRows = await fetchOccupancyByDate(dateNo);
      const lessonIntervals = lessonIntervalsForDate(dateNo, lessonNos);
      const occupied = new Set();

      (occRows || []).forEach((r) => {
        const clrm = r?.Clrm_name;
        if (!clrm) return;
        const occBegin = parseDateTime(r?.Occ_begin);
        const occEnd = parseDateTime(r?.Occ_end);
        if (!occBegin || !occEnd) return;
        const overlaps = lessonIntervals.some((li) => intervalsOverlap(occBegin, occEnd, li.begin, li.end));
        if (overlaps) occupied.add(String(clrm));
      });

      return occupied;
    },
    [fetchOccupancyByDate, lessonIntervalsForDate]
  );

  const [courseFreeRooms, setCourseFreeRooms] = useState([]);
  const [courseRoomLoading, setCourseRoomLoading] = useState(false);
  const [courseHolidayInfo, setCourseHolidayInfo] = useState({ isHoliday: false, holiday: '', dateNo: '' });

  useEffect(() => {
    const run = async () => {
      if (selectedTxn?.type !== 'course') {
        setCourseHolidayInfo({ isHoliday: false, holiday: '', dateNo: '' });
        return;
      }
      const seme = courseSeme;
      const day = courseSelectedDay;
      const week = activeWeek;
      if (!seme || !day || !week) {
        setCourseHolidayInfo({ isHoliday: false, holiday: '', dateNo: '' });
        return;
      }
      try {
        const info = await getDateInfoByWeekDay(seme, day, week);
        if (!info || !info.dateNo) {
          setCourseHolidayInfo({ isHoliday: false, holiday: '', dateNo: '' });
          return;
        }
        const type = String(info.type || '');
        const holidayName = String(info.holiday || '');
        if (type === '节假日') {
          setCourseHolidayInfo({ isHoliday: true, holiday: holidayName || '节假日', dateNo: String(info.dateNo) });
        } else {
          setCourseHolidayInfo({ isHoliday: false, holiday: '', dateNo: String(info.dateNo) });
        }
      } catch {
        setCourseHolidayInfo({ isHoliday: false, holiday: '', dateNo: '' });
      }
    };

    run();
  }, [activeWeek, courseSeme, courseSelectedDay, getDateInfoByWeekDay, selectedTxn?.type]);

  useEffect(() => {
    const run = async () => {
      if (selectedTxn?.type !== 'course') return;
      const campus = setupCourse?.SetupCo_campus;
      const pmax = Number(setupCourse?.SetupCo_pmax);
      const day = courseSelectedDay;
      const per = Number(coursePerSessionLessons);
      const week = activeWeek;
      const lessonNos = selectedLessonsByWeek[week] || [];
      setCourseLeftMessage('');

      if (!campus) {
        setCourseFreeRooms([]);
        return;
      }
      if (!day) {
        setCourseFreeRooms([]);
        return;
      }
      if (!Number.isFinite(per) || per <= 0) {
        setCourseFreeRooms([]);
        return;
      }
      const weekValid =
        requiredWeeks > 0 && Array.isArray(selectedWeeks) && selectedWeeks.length === requiredWeeks && selectedWeeks.includes(week);
      if (!weekValid) {
        setCourseFreeRooms([]);
        return;
      }
      if (!Array.isArray(lessonNos) || lessonNos.length === 0) {
        setCourseFreeRooms([]);
        return;
      }
      if (!Number.isFinite(pmax) || pmax <= 0) {
        setCourseFreeRooms([]);
        return;
      }

      const dateNo = courseHolidayInfo.dateNo;
      if (!dateNo) {
        setCourseFreeRooms([]);
        return;
      }
      if (courseHolidayInfo.isHoliday) {
        setCourseFreeRooms([]);
        setCourseLeftMessage(courseHolidayInfo.holiday ? `当天为${courseHolidayInfo.holiday}，不安排课程。` : '当天为节假日，不安排课程。');
        return;
      }

      setCourseRoomLoading(true);
      try {
        const [rooms, occupied] = await Promise.all([fetchCampusClassrooms(campus), courseOccupiedRoomSet(dateNo, lessonNos)]);
        const free = (rooms || [])
          .filter((r) => Number(r?.Clrm_capacity) >= pmax)
          .filter((r) => !occupied.has(String(r?.Clrm_name)))
          .map((r) => ({ name: String(r.Clrm_name), capacity: Number(r.Clrm_capacity) }))
          .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
        setCourseFreeRooms(free);
        if (free.length === 0) setCourseLeftMessage('当前周次与课节选择下，没有满足容量且空闲的教室。');
      } catch {
        setCourseFreeRooms([]);
        setCourseLeftMessage('查询空闲教室失败。');
      } finally {
        setCourseRoomLoading(false);
      }
    };

    run();
  }, [
    activeWeek,
    courseOccupiedRoomSet,
    coursePerSessionLessons,
    courseSelectedDay,
    courseSeme,
    courseHolidayInfo,
    fetchCampusClassrooms,
    requiredWeeks,
    selectedWeeks,
    selectedLessonsByWeek,
    selectedTxn?.type,
    setupCourse?.SetupCo_campus,
    setupCourse?.SetupCo_pmax,
  ]);

  const toggleLesson = useCallback(
    (week, lno) => {
      const lessonNo = String(lno);
      if (!LESSON_NO_OPTIONS.includes(lessonNo)) return;

      const per = perPerSession;
      const perValid = Number.isFinite(per) && per > 0;
      if (!Array.isArray(selectedWeeks) || !selectedWeeks.includes(week)) return;
      const sortedWeeks = selectedWeeks.slice().sort((a, b) => a - b);
      const lastWeekValue = sortedWeeks.length > 0 ? sortedWeeks[sortedWeeks.length - 1] : null;
      const isLastWeek = lastWeekRemainder > 0 && lastWeekValue !== null && Number(week) === Number(lastWeekValue);
      const targetCount = perValid && isLastWeek && lastWeekRemainder > 0 ? lastWeekRemainder : per;
      const targetValid = Number.isFinite(targetCount) && targetCount > 0;

      setSelectedLessonsByWeek((prev) => {
        const existing = Array.isArray(prev[week]) ? prev[week] : [];
        const set = new Set(existing);
        const alreadySelected = set.has(lessonNo);

        if (alreadySelected) {
          set.delete(lessonNo);
        } else {
          if (targetValid && set.size >= targetCount) return prev;
          set.add(lessonNo);
        }

        const next = Array.from(set).sort((a, b) => Number(a) - Number(b));
        return { ...prev, [week]: next };
      });

      setSelectedClassroomByWeek((prev) => {
        if (!prev[week]) return prev;
        const { [week]: _, ...rest } = prev;
        return rest;
      });
    },
    [lastWeekRemainder, perPerSession, selectedWeeks]
  );

  const selectCourseClassroom = (week, name) => {
    setSelectedClassroomByWeek((prev) => ({ ...prev, [week]: name }));
  };

  const courseArrangementComplete = useMemo(() => {
    if (selectedTxn?.type !== 'course') return false;
    if (!setupCourse?.SetupCo_Courno) return false;
    if (!courseSelectedDay) return false;
    const per = perPerSession;
    if (!Number.isFinite(per) || per <= 0) return false;
    if (!requiredWeeks) return false;
    if (!Array.isArray(selectedWeeks) || selectedWeeks.length !== requiredWeeks) return false;
    const sortedWeeks = selectedWeeks.slice().sort((a, b) => a - b);
    for (let i = 0; i < sortedWeeks.length; i += 1) {
      const w = sortedWeeks[i];
      const lessons = selectedLessonsByWeek[w];
      const clrm = selectedClassroomByWeek[w];
      if (!Array.isArray(lessons)) return false;
      const isLastWeek = lastWeekRemainder > 0 && i === sortedWeeks.length - 1;
      const targetCount = isLastWeek ? lastWeekRemainder : per;
      if (!Number.isFinite(targetCount) || targetCount <= 0) return false;
      if (lessons.length !== targetCount) return false;
      if (!clrm) return false;
    }
    return true;
  }, [
    courseSelectedDay,
    lastWeekRemainder,
    perPerSession,
    requiredWeeks,
    selectedClassroomByWeek,
    selectedLessonsByWeek,
    selectedTxn?.type,
    setupCourse?.SetupCo_Courno,
    selectedWeeks,
  ]);

  const examOccupiedRoomSet = useCallback(
    async (dateNo, begin, end) => {
      const occRows = await fetchOccupancyByDate(dateNo);
      const occupied = new Set();
      (occRows || []).forEach((r) => {
        const clrm = r?.Clrm_name;
        if (!clrm) return;
        const occBegin = parseDateTime(r?.Occ_begin);
        const occEnd = parseDateTime(r?.Occ_end);
        if (!occBegin || !occEnd) return;
        if (intervalsOverlap(occBegin, occEnd, begin, end)) occupied.add(String(clrm));
      });
      return occupied;
    },
    [fetchOccupancyByDate]
  );

  const [examFreeRooms, setExamFreeRooms] = useState([]);
  const [examRoomLoading, setExamRoomLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (selectedTxn?.type !== 'exam') return;
      setExamLeftMessage('');
      if (!examBegin || !examEnd) {
        setExamFreeRooms([]);
        return;
      }
      const dateNo = formatDateOnly(examBegin);
      if (!dateNo) {
        setExamFreeRooms([]);
        return;
      }
      setExamRoomLoading(true);
      try {
        const [allRooms, occupied] = await Promise.all([fetchAllClassrooms(), examOccupiedRoomSet(dateNo, examBegin, examEnd)]);
        const free = (allRooms || [])
          .filter((r) => !occupied.has(String(r?.Clrm_name)))
          .map((r) => ({ name: String(r.Clrm_name), capacity: Number(r.Clrm_capacity) }))
          .sort((a, b) => b.capacity - a.capacity || a.name.localeCompare(b.name));
        setExamFreeRooms(free);
        if (free.length === 0) setExamLeftMessage('该时间段没有空闲教室。');
      } catch {
        setExamFreeRooms([]);
        setExamLeftMessage('查询空闲教室失败。');
      } finally {
        setExamRoomLoading(false);
      }
    };

    run();
  }, [examBegin, examEnd, examOccupiedRoomSet, fetchAllClassrooms, selectedTxn?.type]);

  const classroomCapacityMap = useMemo(() => {
    const map = new Map();
    (examFreeRooms || []).forEach((r) => map.set(r.name, Number(r.capacity) || 0));
    (courseFreeRooms || []).forEach((r) => map.set(r.name, Number(r.capacity) || 0));
    return map;
  }, [courseFreeRooms, examFreeRooms]);

  const examSelectedCapacitySum = useMemo(() => {
    return (selectedExamRooms || []).reduce((acc, name) => acc + (classroomCapacityMap.get(name) || 0), 0);
  }, [classroomCapacityMap, selectedExamRooms]);

  const examArrangementComplete = useMemo(() => {
    if (selectedTxn?.type !== 'exam') return false;
    if (!setupExam?.SetupE_ID) return false;
    if (!examBegin || !examEnd) return false;
    if (!Number.isFinite(examPeopleSum) || examPeopleSum < 0) return false;
    const selectedCount = Array.isArray(selectedExamRooms) ? selectedExamRooms.length : 0;
    if (examPeopleSum === 0) return true;
    if (selectedCount === 0) return false;
    return examSelectedCapacitySum >= examPeopleSum * 3;
  }, [examBegin, examEnd, examPeopleSum, examSelectedCapacitySum, selectedExamRooms, selectedTxn?.type, setupExam?.SetupE_ID]);

  const arrangementComplete = selectedTxn?.type === 'course' ? courseArrangementComplete : selectedTxn?.type === 'exam' ? examArrangementComplete : false;

  const fetchTransactionTable = useCallback(async () => {
    if (!userInfo?.Uno) return;
    const params = new URLSearchParams({
      uno: userInfo.Uno,
      page: String(txnTablePage),
      limit: String(txnTablePageSize),
      ...(txnTableSearchParams || {}),
    });
    setTxnTableLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/arrange/transactions/list?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setTxnTableData([]);
        setTxnTableTotal(0);
        return;
      }
      setTxnTableData(Array.isArray(json.data) ? json.data : []);
      const total = Number(json.pagination?.total);
      setTxnTableTotal(Number.isFinite(total) && total >= 0 ? total : (Array.isArray(json.data) ? json.data.length : 0));
    } catch {
      setTxnTableData([]);
      setTxnTableTotal(0);
    } finally {
      setTxnTableLoading(false);
    }
  }, [txnTablePage, txnTablePageSize, txnTableSearchParams, userInfo?.Uno]);

  useEffect(() => {
    fetchTransactionTable();
  }, [fetchTransactionTable]);

  const handleTxnDetails = useCallback((row) => {
    setDetailsRow(row);
    setDetailsOpen(true);
  }, []);

  const handleTxnSelect = useCallback(
    (row) => {
      if (!row?.type || !row?.id) return;
      setSelectedTxn({ type: row.type, id: row.id });
      setTxnDropdownOpen(false);
      setTxnQuery('');
      setTxnOptions([]);
    },
    []
  );

  const txnColumns = useMemo(() => {
    return [
      { key: 'id', title: '事务编号', width: '30%' },
      { key: 'typeLabel', title: '事务类型', width: '20%' },
      { key: 'summary', title: '摘要', width: '35%' },
      {
        key: 'operations',
        title: '操作',
        width: '150px',
        render: (row) => (
          <div className="operation-btns">
            <button className="icon-btn" title="选择" onClick={() => handleTxnSelect(row)}>
              <img src="/images/table/pass.svg" alt="选择" />
            </button>
            <button className="icon-btn" title="详情" onClick={() => handleTxnDetails(row)}>
              <img src="/images/table/details.svg" alt="详情" />
            </button>
          </div>
        ),
      },
    ];
  }, [handleTxnDetails, handleTxnSelect]);

  const txnDetailsTitle = useMemo(() => {
    if (!detailsRow) return '';
    return detailsRow.id || '';
  }, [detailsRow]);

  const txnDetailsBody = useMemo(() => {
    if (!detailsRow) return '';
    const type = detailsRow.type;
    if (type === 'course') {
      const lines = [
        `事务类型：课程`,
        `事务编号：${detailsRow.id || ''}`,
        `创建时间：${detailsRow.createdAt || ''}`,
        `任教校区：${detailsRow.campus || ''}`,
        `意向最大人数：${detailsRow.pmax ?? ''}`,
      ];
      return lines.join('\n');
    }
    if (type === 'exam') {
      const lines = [
        `事务类型：考试`,
        `事务编号：${detailsRow.id || ''}`,
        `课程编号：${detailsRow.cno || ''}`,
        `考试学期：${detailsRow.seme || ''}`,
        `考试性质：${detailsRow.eattri || ''}`,
        `考试时间：${detailsRow.beginTime || ''}${detailsRow.beginTime && detailsRow.endTime ? ' ~ ' : ''}${detailsRow.endTime || ''}`,
      ];
      return lines.join('\n');
    }
    const lines = [`事务编号：${detailsRow.id || ''}`];
    return lines.join('\n');
  }, [detailsRow]);

  const handleSubmit = async () => {
    if (!arrangementComplete) return;
    if (submitLoading) return;
    if (!userInfo?.Uno) return;
    if (!selectedTxn?.type || !selectedTxn?.id) return;

    setSubmitLoading(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      if (selectedTxn.type === 'course') {
        const courno = selectedTxn.id;
        const per = Number(coursePerSessionLessons);
        const sortedWeeks = Array.isArray(selectedWeeks) ? selectedWeeks.slice().sort((a, b) => a - b) : [];
        const weeks = sortedWeeks.map((week) => ({
          week,
          lessons: selectedLessonsByWeek[week] || [],
          classroom: selectedClassroomByWeek[week] || '',
        }));

        const res = await fetch(`${API_BASE}/api/arrange/course/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uno: userInfo.Uno,
            courno,
            selectedDay: courseSelectedDay,
            perSessionLessons: per,
            weeks,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setSubmitError((json && json.message) || '提交失败');
          return;
        }
        setSubmitSuccess(`提交成功：已安排 ${json.classhour} 课时`);
      } else if (selectedTxn.type === 'exam') {
        const res = await fetch(`${API_BASE}/api/arrange/exam/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uno: userInfo.Uno,
            setupEId: selectedTxn.id,
            classrooms: selectedExamRooms,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setSubmitError((json && json.message) || '提交失败');
          return;
        }
        setSubmitSuccess(`提交成功：${json.eno}，容量 ${json.capacity}/${json.people}`);
      } else {
        setSubmitError('提交失败');
        return;
      }

      occupancyCacheRef.current = new Map();
      setSelectedTxn(null);
      setTxnQuery('');
      setTxnOptions([]);
      setTxnDropdownOpen(false);
    } catch {
      setSubmitError('提交失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const examPeopleExpression = useMemo(() => {
    if (!Array.isArray(examPeopleTerms) || examPeopleTerms.length === 0) return `0=0`;
    return `${examPeopleTerms.join('+')}=${examPeopleSum}`;
  }, [examPeopleSum, examPeopleTerms]);

  const courseDayLabel = useMemo(() => {
    if (!Array.isArray(setupCourseDays) || setupCourseDays.length === 0) return '';
    return setupCourseDays.join('、');
  }, [setupCourseDays]);

  const activeWeekLessons = useMemo(() => selectedLessonsByWeek[activeWeek] || [], [activeWeek, selectedLessonsByWeek]);
  const activeWeekClassroom = useMemo(() => selectedClassroomByWeek[activeWeek] || '', [activeWeek, selectedClassroomByWeek]);

  const courseLessonSummary = useMemo(() => {
    const list = (activeWeekLessons || []).slice().sort((a, b) => Number(a) - Number(b));
    if (list.length === 0) return '';
    if (list.length === 1) return `第${Number(list[0])}节`;
    const nums = list.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const set = new Set(nums);
    let contiguous = true;
    for (let i = min; i <= max; i += 1) {
      if (!set.has(i)) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) return `第${min}到${max}节`;
    return `第${nums.join('、')}节`;
  }, [activeWeekLessons]);

  const topRowContent = useMemo(() => {
    if (!selectedTxn?.type) return null;
    if (selectedTxn.type === 'course') {
      return (
        <div className="arrange-info">
          <div className="arrange-info-line">
            <span className="arrange-info-label">任教校区：</span>
            <span className="arrange-info-value">{setupCourse?.SetupCo_campus || ''}</span>
          </div>
          <div className="arrange-info-line">
            <span className="arrange-info-label">意向星期：</span>
            <span className="arrange-info-value">{courseDayLabel}</span>
          </div>
          <div className="arrange-info-line">
            <span className="arrange-info-label">意向最大人数：</span>
            <span className="arrange-info-value">{setupCourse?.SetupCo_pmax ?? ''}</span>
          </div>
        </div>
      );
    }

    if (selectedTxn.type === 'exam') {
      return (
        <div className="arrange-info">
          <div className="arrange-info-line">
            <span className="arrange-info-label">考试时间：</span>
            <span className="arrange-info-value">
              {formatDateTimeDisplay(examBegin)}
              {examBegin && examEnd ? ' ~ ' : ''}
              {formatDateTimeDisplay(examEnd)}
            </span>
          </div>
          <div className="arrange-info-line">
            <span className="arrange-info-label">考试人数：</span>
            <span className="arrange-info-value">{examPeopleExpression}</span>
          </div>
        </div>
      );
    }

    return null;
  }, [courseDayLabel, examBegin, examEnd, examPeopleExpression, selectedTxn?.type, setupCourse?.SetupCo_campus, setupCourse?.SetupCo_pmax]);

  const bottomRowContent = useMemo(() => {
    if (!selectedTxn?.type) return null;

    if (selectedTxn.type === 'course') {
      const per = Number(coursePerSessionLessons);
      const perValid = Number.isFinite(per) && per > 0;
      const selectedWeeksSorted = Array.isArray(selectedWeeks) ? selectedWeeks.slice().sort((a, b) => a - b) : [];
      const weekSelectable = perValid && requiredWeeks > 0 && availableWeeks.length > 0;
      const weekValid = weekSelectable && selectedWeeksSorted.length === requiredWeeks;
      const currentWeek = activeWeek;
      const canGoPrev = weekValid && selectedWeeksSorted.length > 0 && selectedWeeksSorted[0] !== currentWeek;
      const canGoNext = weekValid && selectedWeeksSorted.length > 0 && selectedWeeksSorted[selectedWeeksSorted.length - 1] !== currentWeek;
      const isHoliday = courseHolidayInfo.isHoliday;
      return (
        <div className="arrange-key">
          <div className="arrange-key-top">
            <div className="arrange-key-field">
              <span className="arrange-key-label">选定星期：</span>
              <select className="arrange-key-select" value={courseSelectedDay} onChange={(e) => setCourseSelectedDay(e.target.value)}>
                <option value="">请选择</option>
                {setupCourseDays.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="arrange-key-field">
              <span className="arrange-key-label">每次课时：</span>
              <select className="arrange-key-select" value={coursePerSessionLessons} onChange={(e) => setCoursePerSessionLessons(e.target.value)}>
                <option value="">请选择</option>
                {Array.from({ length: 13 }, (_, i) => String(i + 1)).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="arrange-key-field wide">
              <span className="arrange-key-label">所需周次：</span>
              <span className="arrange-key-value">
                {curricularClasshour && perValid && requiredWeeks
                  ? `${requiredWeeks}（${totalClasshour} = ${perPerSession}×${weeksFull}${
                      lastWeekRemainder >= 0 ? ` + ${lastWeekRemainder}` : ''
                    }）`
                  : ''}
              </span>
            </div>
          </div>

          <div className="arrange-key-middle">
            <div className="arrange-key-field wide">
              <span className="arrange-key-label">选定周次：</span>
              <div className="arrange-picker" ref={weekDropdownRef}>
                <div
                  className="arrange-picker-control"
                  onClick={() => {
                    if (!weekSelectable) return;
                    setWeekDropdownOpen((v) => !v);
                  }}
                >
                  <div className="arrange-picker-chips">
                    {Array.isArray(selectedWeeks) && selectedWeeks.length > 0 ? (
                      selectedWeeks
                        .slice()
                        .sort((a, b) => a - b)
                        .map((w) => (
                          <div key={w} className="arrange-picker-chip">
                            <span className="arrange-picker-chip-text">{w}</span>
                            <button
                              type="button"
                              className="arrange-picker-chip-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                const next = selectedWeeks.filter((x) => x !== w);
                                setSelectedWeeks(next);
                                if (next.length === 0) {
                                  setActiveWeek(0);
                                } else if (!next.includes(activeWeek)) {
                                  setActiveWeek(next[0]);
                                }
                              }}
                            >
                              X
                            </button>
                          </div>
                        ))
                    ) : (
                      <span className="arrange-picker-placeholder">点击选择周次</span>
                    )}
                  </div>
                  <div className="arrange-picker-caret">▾</div>
                </div>

                {weekDropdownOpen && (
                  <div className="arrange-picker-dropdown">
                    <div className="arrange-picker-options">
                      {availableWeeks.length === 0 ? (
                        <div className="arrange-picker-hint">无可用周次</div>
                      ) : (
                        availableWeeks.map((w) => {
                          const selectedSet = new Set(selectedWeeks || []);
                          const checked = selectedSet.has(w);
                          return (
                            <button
                              key={w}
                              type="button"
                              className={`arrange-picker-option ${checked ? 'selected' : ''}`}
                              onClick={() => {
                                if (!weekSelectable) return;
                                setSelectedWeeks((prev) => {
                                  const curr = Array.isArray(prev) ? prev.slice() : [];
                                  const set = new Set(curr);
                                  if (set.has(w)) {
                                    set.delete(w);
                                  } else {
                                    if (requiredWeeks && requiredWeeks > 0 && set.size >= requiredWeeks) return curr;
                                    set.add(w);
                                  }
                                  const next = Array.from(set).sort((a, b) => a - b);
                                  if (next.length === 0) {
                                    setActiveWeek(0);
                                  } else if (!next.includes(activeWeek)) {
                                    setActiveWeek(next[0]);
                                  }
                                  return next;
                                });
                              }}
                            >
                              <span className="uno">{w}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="arrange-key-body">
            <div className="arrange-key-left">
              <div className="arrange-week-nav">
                <button
                  className="arrange-week-btn"
                  type="button"
                  disabled={!canGoPrev}
                  onClick={() => {
                    if (!weekValid) return;
                    const sorted = Array.isArray(selectedWeeks) ? selectedWeeks.slice().sort((a, b) => a - b) : [];
                    const idx = sorted.indexOf(currentWeek);
                    if (idx > 0) setActiveWeek(sorted[idx - 1]);
                  }}
                >
                  上一周
                </button>
                <div className="arrange-week-title">
                  {currentWeek ? `第${currentWeek}周` : ''}
                  {courseLessonSummary ? `，${courseLessonSummary}` : ''}
                </div>
                <button
                  className="arrange-week-btn"
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => {
                    if (!weekValid) return;
                    const sorted = Array.isArray(selectedWeeks) ? selectedWeeks.slice().sort((a, b) => a - b) : [];
                    const idx = sorted.indexOf(currentWeek);
                    if (idx >= 0 && idx < sorted.length - 1) setActiveWeek(sorted[idx + 1]);
                  }}
                >
                  下一周
                </button>
              </div>

              {isHoliday && (
                <div className="arrange-holiday-hint">
                  当天为{courseHolidayInfo.holiday || '节假日'}
                </div>
              )}

              <div className="arrange-lesson-grid">
                {LESSON_NO_OPTIONS.map((lno) => {
                  const selected = (activeWeekLessons || []).includes(lno);
                  const disabled = !courseSelectedDay || !perValid || !weekValid || isHoliday;
                  return (
                    <button
                      key={lno}
                      className={`arrange-lesson-btn${selected ? ' selected' : ''}${isHoliday ? ' holiday-disabled' : ''}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleLesson(activeWeek, lno)}
                    >
                      {isHoliday && <span className="arrange-lesson-x">X</span>}
                      {Number(lno)}
                    </button>
                  );
                })}
              </div>

              <div className="arrange-week-progress">
                {weekValid ? (
                  <>
                    已完成{' '}
                    {selectedWeeksSorted.filter((w, index) => {
                      const lessons = selectedLessonsByWeek[w];
                      const clrm = selectedClassroomByWeek[w];
                      if (!Array.isArray(lessons) || !clrm) return false;
                      const perValidInner = Number.isFinite(per) && per > 0;
                      if (!perValidInner) return false;
                      const isLastWeekInner = lastWeekRemainder > 0 && index === selectedWeeksSorted.length - 1;
                      const targetCountInner = isLastWeekInner ? lastWeekRemainder : per;
                      if (!Number.isFinite(targetCountInner) || targetCountInner <= 0) return false;
                      return lessons.length === targetCountInner;
                    }).length}
                    /{requiredWeeks}
                    {(() => {
                      const perValidInner = Number.isFinite(per) && per > 0;
                      const idx = selectedWeeksSorted.indexOf(currentWeek);
                      const isLastWeekInner =
                        lastWeekRemainder > 0 && idx >= 0 && idx === selectedWeeksSorted.length - 1;
                      const targetCountInner =
                        isLastWeekInner && lastWeekRemainder > 0 ? lastWeekRemainder : per;
                      if (!perValidInner || !Number.isFinite(targetCountInner) || targetCountInner <= 0) return null;
                      const currentCount = (activeWeekLessons || []).length;
                      if (currentCount < targetCountInner) return null;
                      return <span style={{ marginLeft: 8 }}>（已达到最大数量）</span>;
                    })()}
                  </>
                ) : (
                  ''
                )}
              </div>
            </div>

            <div className="arrange-key-right">
              <div className="arrange-room-header">
                <div className="arrange-room-title">空闲教室列表</div>
                <div className="arrange-room-subtitle">
                  {activeWeekClassroom ? `已选：${activeWeekClassroom}` : ''}
                </div>
              </div>

              {(courseLeftMessage || '') && <div className="arrange-inline-hint">{courseLeftMessage}</div>}

              <div className="arrange-room-list">
                {courseRoomLoading ? (
                  <div className="arrange-inline-hint">加载中…</div>
                ) : courseFreeRooms.length === 0 ? (
                  <div className="arrange-inline-hint">暂无可选教室</div>
                ) : (
                  courseFreeRooms.map((r) => {
                    const selected = activeWeekClassroom === r.name;
                    return (
                      <button
                        key={r.name}
                        className={`arrange-room-item${selected ? ' selected' : ''}`}
                        type="button"
                        onClick={() => selectCourseClassroom(activeWeek, r.name)}
                        disabled={!courseSelectedDay || !perValid || !weekValid || (activeWeekLessons || []).length === 0}
                      >
                        <span className="arrange-room-name">{r.name}</span>
                        <span className="arrange-room-capacity">容量 {r.capacity}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (selectedTxn.type === 'exam') {
      return (
        <div className="arrange-key">
          <div className="arrange-exam-summary">
            <div className="arrange-exam-summary-line">
              <span className="arrange-info-label">已选教室容量和：</span>
              <span className="arrange-info-value">
                {examSelectedCapacitySum}
                {Number.isFinite(examPeopleSum) ? ` / ${examPeopleSum}` : ''}
              </span>
            </div>
          </div>

          {(examLeftMessage || '') && <div className="arrange-inline-hint">{examLeftMessage}</div>}

          <div className="arrange-exam-room-list">
            {examRoomLoading ? (
              <div className="arrange-inline-hint">加载中…</div>
            ) : examFreeRooms.length === 0 ? (
              <div className="arrange-inline-hint">暂无可选教室</div>
            ) : (
              examFreeRooms.map((r) => {
                const checked = selectedExamRooms.includes(r.name);
                return (
                  <label key={r.name} className={`arrange-exam-room-item${checked ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedExamRooms((prev) => {
                          const set = new Set(prev);
                          if (set.has(r.name)) set.delete(r.name);
                          else set.add(r.name);
                          return Array.from(set);
                        });
                      }}
                    />
                    <span className="arrange-room-name">{r.name}</span>
                    <span className="arrange-room-capacity">容量 {r.capacity}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      );
    }

    return null;
  }, [
    activeWeek,
    activeWeekClassroom,
    activeWeekLessons,
    courseFreeRooms,
    courseHolidayInfo,
    courseLeftMessage,
    courseRoomLoading,
    courseSelectedDay,
    courseLessonSummary,
    examFreeRooms,
    examLeftMessage,
    examPeopleSum,
    examRoomLoading,
    examSelectedCapacitySum,
    lastWeekRemainder,
    perPerSession,
    requiredWeeks,
    selectedClassroomByWeek,
    selectedExamRooms,
    selectedLessonsByWeek,
    selectedTxn?.type,
    setupCourseDays,
    toggleLesson,
    totalClasshour,
    curricularClasshour,
    coursePerSessionLessons,
    weeksFull,
    availableWeeks,
    selectedWeeks,
    weekDropdownOpen,
  ]);

  return (
    <MorePageLayout title="事务安排" systemRole={getSystemRole()} onLogout={handleLogout} onNavigate={(item) => navigate(item.url)}>
      <Details open={detailsOpen} title={txnDetailsTitle} onClose={() => setDetailsOpen(false)}>
        <div className="arrange-details-body">{txnDetailsBody}</div>
      </Details>
      <div className="arrange-root">
        <div className="arrange-left">
          <div className="arrange-left-scroll">
            <div className="arrange-left-title">事务安排</div>

            <div className="arrange-row small">
                <div className="arrange-cell" style={{ width: '100%' }}>
                  <span className="arrange-label">事务编号：</span>
                  <div className="arrange-picker" ref={txnDropdownRef} style={{ flex: 1, minWidth: 0 }}>
                    <div className="arrange-picker-control" onClick={() => setTxnDropdownOpen((v) => !v)}>
                      <div className="arrange-picker-chips">
                        {selectedTxn ? (
                          <div className="arrange-picker-chip">
                            <span className="arrange-picker-chip-text">{selectedTxn.id}</span>
                            <button
                              type="button"
                              className="arrange-picker-chip-remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTxn(null);
                                setTxnQuery('');
                              setTxnOptions([]);
                            }}
                          >
                            ×
                            </button>
                          </div>
                        ) : (
                          <div className="arrange-picker-placeholder">请选择事务</div>
                        )}
                      </div>
                      <div style={{ marginLeft: 10, opacity: 0.6 }}>{txnDropdownOpen ? '▲' : '▼'}</div>
                    </div>

                    {txnDropdownOpen && (
                      <div className="arrange-picker-dropdown">
                        <input
                          className="arrange-picker-search"
                          value={txnQuery}
                          onChange={(e) => setTxnQuery(e.target.value)}
                          placeholder="输入至少5个字符搜索"
                        />
                        <div className="arrange-picker-options">
                          {txnQuery.trim().length < 5 ? (
                            <div className="arrange-picker-hint">请输入至少5个字符进行搜索</div>
                          ) : txnOptions.length === 0 ? (
                            <div className="arrange-picker-hint">无匹配结果</div>
                          ) : (
                            txnOptions.map((opt) => {
                              const selected = selectedTxn?.type === opt.type && selectedTxn?.id === opt.id;
                              return (
                                <div
                                  key={`${opt.type}:${opt.id}`}
                                  className={`arrange-picker-option${selected ? ' selected' : ''}`}
                                  onClick={() => {
                                    setSelectedTxn(opt);
                                    setTxnDropdownOpen(false);
                                    setTxnQuery('');
                                  setTxnOptions([]);
                                }}
                              >
                                <span className="uno">{opt.id}</span>
                                <span className="urole">{opt.type === 'course' ? '课程' : '考试'}</span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="arrange-split">
              <div className="arrange-split-top">{topRowContent}</div>
              <div className={`arrange-split-bottom${selectedTxn?.type ? (arrangementComplete ? ' ok' : ' bad') : ''}`}>
                {bottomRowContent}
              </div>
            </div>
          </div>
        </div>

        <div className="arrange-right">
          <div className="arrange-right-top">
            <Table
              columns={txnColumns}
              data={txnTableData}
              total={txnTableTotal}
              currentPage={txnTablePage}
              pageSize={txnTablePageSize}
              onPageChange={setTxnTablePage}
              onPageSizeChange={setTxnTablePageSize}
              onSearch={(params) => {
                const next = {};
                const idVal = params.id;
                if (idVal && String(idVal).trim()) next.searchId = String(idVal).trim();
                setTxnTablePage(1);
                setTxnTableSearchParams(next);
              }}
              onRefresh={fetchTransactionTable}
              loading={txnTableLoading}
            />
          </div>
          <div className="arrange-right-bottom">
            {(submitError || '') && <div className="arrange-submit-hint error">{submitError}</div>}
            {(submitSuccess || '') && <div className="arrange-submit-hint success">{submitSuccess}</div>}
            <button className="arrange-send" type="button" disabled={!arrangementComplete || submitLoading} onClick={handleSubmit}>
              {submitLoading ? '提交中…' : '提交'}
            </button>
          </div>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default Arrange;
