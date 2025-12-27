import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MorePageLayout from '../../components/Layout/MorePageLayout';
import './EditMessage.css';

const getCurrentUserFromStorage = () => {
  try {
    const currentUno = sessionStorage.getItem('currentUno');
    if (currentUno) {
      const mapStr = localStorage.getItem('userMap');
      if (mapStr) {
        const map = JSON.parse(mapStr);
        if (map && typeof map === 'object' && map[currentUno]) {
          return map[currentUno];
        }
      }
    }
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};

const EditMessage = () => {
  const navigate = useNavigate();
  const [userInfo] = useState(() => {
    return getCurrentUserFromStorage();
  });

  const [receiverDropdownOpen, setReceiverDropdownOpen] = useState(false);
  const [receiverQuery, setReceiverQuery] = useState('');
  const [receiverOptions, setReceiverOptions] = useState([]);
  const [selectedReceivers, setSelectedReceivers] = useState([]);

  const [msgCategory, setMsgCategory] = useState('通知');
  const [msgPriority, setMsgPriority] = useState('一般');
  const [wdMsgNo, setWdMsgNo] = useState('');
  const [msgContent, setMsgContent] = useState('');

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);

  const receiverSearchTimerRef = useRef(null);
  const userSearchTimerRef = useRef(null);
  const receiverDropdownRef = useRef(null);

  useEffect(() => {
    if (!userInfo) navigate('/login');
  }, [navigate, userInfo]);

  const handleLogout = () => {
    navigate('/login');
  };

  const getSystemRole = () => {
    if (!userInfo) return '';
    return userInfo.Urole;
  };

  const selectedReceiverMap = useMemo(() => {
    return new Map(selectedReceivers.map(r => [r.Uno, r]));
  }, [selectedReceivers]);

  const fetchUsersByUno = useCallback(async (query) => {
    const params = new URLSearchParams({ uno: query, limit: 50 });
    const res = await fetch(`/api/users/search?${params.toString()}`);
    const json = await res.json();
    if (json.success) return json.data || [];
    return [];
  }, []);

  const fetchUsersByName = useCallback(async (query) => {
    const params = new URLSearchParams({ name: query, limit: 50 });
    const res = await fetch(`/api/users/search?${params.toString()}`);
    const json = await res.json();
    if (json.success) return json.data || [];
    return [];
  }, []);

  useEffect(() => {
    const onDocumentClick = (e) => {
      if (!receiverDropdownRef.current) return;
      if (!receiverDropdownRef.current.contains(e.target)) {
        setReceiverDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useEffect(() => {
    if (receiverSearchTimerRef.current) clearTimeout(receiverSearchTimerRef.current);

    if (receiverQuery.trim().length < 5) return;

    receiverSearchTimerRef.current = setTimeout(async () => {
      try {
        const rows = await fetchUsersByUno(receiverQuery.trim());
        setReceiverOptions(rows);
      } catch (err) {
        console.error('Search receiver error:', err);
        setReceiverOptions([]);
      }
    }, 250);

    return () => {
      if (receiverSearchTimerRef.current) clearTimeout(receiverSearchTimerRef.current);
    };
  }, [receiverQuery, fetchUsersByUno]);

  useEffect(() => {
    if (userSearchTimerRef.current) clearTimeout(userSearchTimerRef.current);

    const q = userSearchQuery.trim();
    if (q.length === 0) return;

    userSearchTimerRef.current = setTimeout(async () => {
      try {
        const rows = await fetchUsersByName(q);
        setUserSearchResults(rows);
      } catch (err) {
        console.error('Search user error:', err);
        setUserSearchResults([]);
      }
    }, 250);

    return () => {
      if (userSearchTimerRef.current) clearTimeout(userSearchTimerRef.current);
    };
  }, [userSearchQuery, fetchUsersByName]);

  const addReceiver = (user) => {
    if (!user || !user.Uno) return;
    if (selectedReceiverMap.has(user.Uno)) return;
    setSelectedReceivers(prev => [...prev, { Uno: user.Uno, Urole: user.Urole, Name: user.Name }]);
  };

  const removeReceiver = (uno) => {
    setSelectedReceivers(prev => prev.filter(r => r.Uno !== uno));
  };

  const handleSend = async () => {
    if (!userInfo) return;
    if (selectedReceivers.length === 0) {
      alert('请选择至少一个收信人');
      return;
    }
    if (msgContent.trim().length === 0) {
      alert('请输入消息内容');
      return;
    }

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUno: userInfo.Uno,
          receiverUnos: selectedReceivers.map(r => r.Uno),
          category: msgCategory,
          priority: msgPriority,
          wdMsgNo: msgCategory === '撤回' ? wdMsgNo.trim() : null,
          content: msgContent
        })
      });
      const json = await res.json();
      if (json.success) {
        setSelectedReceivers([]);
        setReceiverQuery('');
        setReceiverOptions([]);
        setMsgCategory('通知');
        setMsgPriority('一般');
        setWdMsgNo('');
        setMsgContent('');
        alert('发送成功');
      } else {
        alert(json.message || '发送失败');
      }
    } catch (err) {
      console.error('Send message error:', err);
      alert('发送失败');
    }
  };

  return (
    <MorePageLayout
      title="发信息"
      systemRole={getSystemRole()}
      onLogout={handleLogout}
      onNavigate={(item) => navigate(item.url)}
    >
      <div className="editmessage-container">
        <div className="editmessage-editor">
          <div className="editmessage-editor-row editmessage-editor-row-light">
            <div className="editmessage-editor-label">收信人：</div>
            <div className="editmessage-receiver" ref={receiverDropdownRef}>
              <div
                className="editmessage-receiver-control"
                onClick={() => setReceiverDropdownOpen(v => !v)}
              >
                <div className="editmessage-receiver-chips">
                  {selectedReceivers.map(r => (
                    <div key={r.Uno} className="editmessage-chip">
                      <span className="editmessage-chip-text">{r.Uno}</span>
                      <button
                        type="button"
                        className="editmessage-chip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeReceiver(r.Uno);
                        }}
                      >
                        X
                      </button>
                    </div>
                  ))}
                  {selectedReceivers.length === 0 && (
                    <span className="editmessage-receiver-placeholder">点击选择收信人</span>
                  )}
                </div>
                <div className="editmessage-receiver-caret">▾</div>
              </div>

              {receiverDropdownOpen && (
                <div className="editmessage-receiver-dropdown">
                  <input
                    className="editmessage-receiver-search"
                    value={receiverQuery}
                    onChange={(e) => setReceiverQuery(e.target.value)}
                    placeholder="输入 Uno 模糊搜索（至少5个字符）"
                  />
                  <div className="editmessage-receiver-options">
                    {receiverQuery.trim().length < 5 ? (
                      <div className="editmessage-receiver-hint">请输入至少5个字符</div>
                    ) : receiverOptions.length === 0 ? (
                      <div className="editmessage-receiver-hint">无匹配结果</div>
                    ) : (
                      receiverOptions.map(u => (
                        <button
                          key={u.Uno}
                          type="button"
                          className={`editmessage-receiver-option ${selectedReceiverMap.has(u.Uno) ? 'selected' : ''}`}
                          onClick={() => addReceiver(u)}
                        >
                          <span className="uno">{u.Uno}</span>
                          <span className="urole">{u.Urole}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="editmessage-editor-row editmessage-editor-row-dark">
            <div className="editmessage-field">
              <div className="editmessage-field-label">类别</div>
              <select
                className="editmessage-field-input"
                value={msgCategory}
                onChange={(e) => setMsgCategory(e.target.value)}
              >
                <option value="通知">通知</option>
                <option value="代办">代办</option>
                <option value="撤回">撤回</option>
              </select>
            </div>

            <div className="editmessage-field">
              <div className="editmessage-field-label">优先级</div>
              <select
                className="editmessage-field-input"
                value={msgPriority}
                onChange={(e) => setMsgPriority(e.target.value)}
              >
                <option value="一般">一般</option>
                <option value="重要">重要</option>
              </select>
            </div>

            <div className="editmessage-field">
              <div className="editmessage-field-label">撤回编号</div>
              <input
                className="editmessage-field-input"
                value={wdMsgNo}
                onChange={(e) => setWdMsgNo(e.target.value)}
                disabled={msgCategory !== '撤回'}
                placeholder={msgCategory === '撤回' ? 'Msg_wdMsgno' : '仅撤回时可填'}
              />
            </div>
          </div>

          <div className="editmessage-editor-content">
            <textarea
              className="editmessage-textarea"
              value={msgContent}
              onChange={(e) => setMsgContent(e.target.value)}
              maxLength={511}
              placeholder="请输入消息内容（最多511个字符）"
            />
            <div className="editmessage-content-count">{msgContent.length}/511</div>
          </div>
        </div>

        <div className="editmessage-right">
          <div className="editmessage-query">
            <div className="editmessage-query-header">
              <input
                className="editmessage-query-input"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="输入用户名模糊搜索 Uno"
              />
            </div>
            <div className="editmessage-query-body">
                <div className="editmessage-query-table">
                  <div className="editmessage-query-row header">
                    <div className="col-name">姓名</div>
                  <div className="col-uno">编号</div>
                  <div className="col-role">类型</div>
                  </div>
                  {(userSearchQuery.trim().length === 0 ? [] : userSearchResults).map(u => (
                    <button
                      key={u.Uno}
                    type="button"
                    className="editmessage-query-row"
                    onClick={() => addReceiver(u)}
                    title="点击加入收信人"
                  >
                    <div className="col-name">{u.Name || ''}</div>
                    <div className="col-uno">{u.Uno}</div>
                    <div className="col-role">{u.Urole}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="button" className="editmessage-send" onClick={handleSend}>
            发送
          </button>
        </div>
      </div>
    </MorePageLayout>
  );
};

export default EditMessage;
