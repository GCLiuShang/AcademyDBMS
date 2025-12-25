const db = require('../db');
const { getNextSequenceNumber } = require('./sequenceService');

async function sendSystemMessage(uno, content, priority = '重要') {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const dateStrDash = `${yyyy}-${mm}-${dd}`;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const msgNumber = await getNextSequenceNumber(connection, 'Message', 'Msg_number', { Msg_date: dateStrDash });
    const msgNumberHex = msgNumber.toString(16).toUpperCase().padStart(9, '0');
    const msgNo = `MSG${dateStr}${msgNumberHex}`;

    await connection.execute(
      `INSERT INTO Message (Msg_no, Msg_date, Msg_number, Msg_category, Msg_priority, Msg_content) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [msgNo, now, msgNumber, '系统', priority, content]
    );

    await connection.execute(
      `INSERT INTO Msg_Send (Msg_no, Send_time, Send_display)
       VALUES (?, ?, ?)`,
      [msgNo, now, true]
    );

    await connection.execute(
      `INSERT INTO Msg_Receive (Msg_no, Receive_Uno, Receive_time, Receive_haveread, Receive_display)
       VALUES (?, ?, ?, ?, ?)`,
      [msgNo, uno, '1000-01-01 00:00:00', false, true]
    );

    await connection.commit();
    console.log(`System message sent to ${uno}: ${msgNo}`);
  } catch (error) {
    await connection.rollback();
    console.error('Error sending system message:', error);
  } finally {
    connection.release();
  }
}

async function insertSystemMessageToMany(connection, receiverUnos, content, priority = '重要', category = '系统') {
  const uniqueReceivers = Array.from(new Set((receiverUnos || []).filter(Boolean)));
  if (uniqueReceivers.length === 0) return null;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const dateStrDash = `${yyyy}-${mm}-${dd}`;

  const msgNumber = await getNextSequenceNumber(connection, 'Message', 'Msg_number', { Msg_date: dateStrDash });
  const msgNumberHex = msgNumber.toString(16).toUpperCase().padStart(9, '0');
  const msgNo = `MSG${dateStr}${msgNumberHex}`;

  await connection.execute(
    `INSERT INTO Message (Msg_no, Msg_date, Msg_number, Msg_category, Msg_priority, Msg_content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [msgNo, now, msgNumber, category, priority, content]
  );

  await connection.execute(
    `INSERT INTO Msg_Send (Msg_no, Send_Uno, Send_time, Send_display)
     VALUES (?, ?, ?, ?)`,
    [msgNo, 'O000000000', now, true]
  );

  for (const targetUno of uniqueReceivers) {
    await connection.execute(
      `INSERT INTO Msg_Receive (Msg_no, Receive_Uno, Receive_time, Receive_haveread, Receive_display)
       VALUES (?, ?, ?, ?, ?)`,
      [msgNo, targetUno, '1000-01-01 00:00:00', false, true]
    );
  }

  return msgNo;
}

async function sendWelcomeMessage(user) {
  const now = new Date();
  const hour = now.getHours();
  let greeting = '';

  if (hour >= 6 && hour < 12) greeting = '上午好';
  else if (hour >= 12 && hour < 18) greeting = '下午好';
  else greeting = '晚上好';

  const content = `${user.name}，${greeting}`;
  await sendSystemMessage(user.Uno, content, '一般');
}

module.exports = {
  sendSystemMessage,
  insertSystemMessageToMany,
  sendWelcomeMessage,
};

