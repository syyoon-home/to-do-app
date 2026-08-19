(() => {
  'use strict';

  const STORAGE_KEY = 'haru-app-data-v1';
  const CATEGORY_META = {
    exercise: { label: '운동', color: '#4FD8B0', bg: '#E4FAF3' },
    work:     { label: '업무', color: '#5DAAF5', bg: '#E9F3FE' },
    social:   { label: '약속', color: '#FFB648', bg: '#FFF3E1' },
    dev:      { label: '개발', color: '#9C97F5', bg: '#EFEDFE' },
    etc:      { label: '기타', color: '#FF8F70', bg: '#FFEDE7' }
  };
  const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토'];

  // ---------- Date helpers ----------
  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }
  function minutesToLabel(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ---------- State ----------
  let state = loadState();
  let selectedDate = new Date();
  let calViewMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore corrupt storage */ }
    return { todos: {}, blocks: {} };
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('저장 실패', e);
    }
  }
  function getTodos(dateKey) {
    return state.todos[dateKey] || [];
  }
  function getBlocks(dateKey) {
    return state.blocks[dateKey] || [];
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const headerMain = $('#header-date-main');
  const headerSub = $('#header-date-sub');
  const headerSummary = $('#header-summary');
  const weekStrip = $('#week-strip');
  const todoList = $('#todo-list');
  const todoProgress = $('#todo-progress');

  const calMonthLabel = $('#cal-month-label');
  const calGrid = $('#cal-grid');
  const calSelectedLabel = $('#cal-selected-label');
  const calDayEvents = $('#cal-day-events');

  const ttAxis = $('#tt-axis');
  const ttRows = $('#tt-rows');
  const ttSummary = $('#tt-summary');
  const ttNowText = $('#tt-now-text');
  const ttLegend = $('#tt-legend');

  // ---------- Render: Header ----------
  function renderHeader() {
    const dateKey = toKey(selectedDate);
    headerSub.textContent = `${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월`;
    headerMain.textContent = `${selectedDate.getDate()}일 ${WEEKDAYS_KR[selectedDate.getDay()]}요일`;

    const todos = getTodos(dateKey);
    const blocks = getBlocks(dateKey);
    const totalMin = blocks.reduce((sum, b) => sum + (timeToMinutes(b.end) - timeToMinutes(b.start)), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const timeStr = totalMin > 0 ? `${h > 0 ? h + '시간 ' : ''}${m > 0 ? m + '분 ' : ''}활동` : '활동 없음';
    headerSummary.textContent = `오늘 할 일 ${todos.length}개 · ${timeStr}`;
  }

  // ---------- Render: Todo view ----------
  function renderWeekStrip() {
    weekStrip.innerHTML = '';
    const start = addDays(selectedDate, -3);
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const btn = document.createElement('button');
      btn.className = 'week-day' + (isSameDay(d, selectedDate) ? ' selected' : '');
      btn.innerHTML = `<span class="wd-label">${WEEKDAYS_KR[d.getDay()]}</span><span class="wd-num">${d.getDate()}</span>`;
      btn.addEventListener('click', () => {
        selectedDate = d;
        renderAll();
      });
      weekStrip.appendChild(btn);
    }
  }

  function renderTodoList() {
    const dateKey = toKey(selectedDate);
    const todos = getTodos(dateKey);
    todoList.innerHTML = '';

    if (todos.length === 0) {
      todoList.innerHTML = '<p class="empty-state">아직 할일이 없어요. + 버튼으로 추가해보세요.</p>';
      todoProgress.textContent = '0/0 완료';
      return;
    }

    const doneCount = todos.filter((t) => t.done).length;
    todoProgress.textContent = `${doneCount}/${todos.length} 완료`;

    todos.forEach((todo) => {
      const item = document.createElement('div');
      item.className = 'todo-item' + (todo.done ? ' done' : '');
      item.innerHTML = `
        <button class="todo-check" aria-label="완료 표시"><i class="ti ti-check" aria-hidden="true"></i></button>
        <p class="todo-text"></p>
        ${todo.important ? '<span class="badge-important">중요</span>' : ''}
        <button class="todo-delete" aria-label="삭제"><i class="ti ti-x" aria-hidden="true"></i></button>
      `;
      item.querySelector('.todo-text').textContent = todo.text;
      item.querySelector('.todo-check').addEventListener('click', () => {
        todo.done = !todo.done;
        saveState();
        renderTodoList();
        renderHeader();
      });
      item.querySelector('.todo-delete').addEventListener('click', () => {
        const list = getTodos(dateKey);
        state.todos[dateKey] = list.filter((t) => t.id !== todo.id);
        saveState();
        renderTodoList();
        renderHeader();
      });
      todoList.appendChild(item);
    });
  }

  // ---------- Render: Calendar view ----------
  function renderCalendar() {
    calMonthLabel.textContent = `${calViewMonth.getFullYear()}년 ${calViewMonth.getMonth() + 1}월`;
    calGrid.innerHTML = '';

    const firstOfMonth = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth(), 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = addDays(firstOfMonth, -startOffset);
    const today = new Date();

    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const dateKey = toKey(d);
      const cell = document.createElement('button');
      cell.className = 'cal-cell';
      if (d.getMonth() !== calViewMonth.getMonth()) cell.classList.add('other-month');
      if (isSameDay(d, today)) cell.classList.add('today');
      if (isSameDay(d, selectedDate)) cell.classList.add('selected');

      const todos = getTodos(dateKey);
      const blocks = getBlocks(dateKey);
      const dotCount = Math.min(3, (todos.length > 0 ? 1 : 0) + (blocks.length > 0 ? 1 : 0));

      cell.innerHTML = `<span>${d.getDate()}</span><span class="dot-row">${'<span></span>'.repeat(dotCount)}</span>`;
      cell.addEventListener('click', () => {
        selectedDate = d;
        if (d.getMonth() !== calViewMonth.getMonth()) {
          calViewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        }
        renderAll();
      });
      calGrid.appendChild(cell);
    }

    calSelectedLabel.textContent = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 일정`;
    renderDayEvents();
  }

  function renderDayEvents() {
    const dateKey = toKey(selectedDate);
    const blocks = [...getBlocks(dateKey)].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    calDayEvents.innerHTML = '';
    if (blocks.length === 0) {
      calDayEvents.innerHTML = '<p class="empty-state">이 날은 등록된 일정이 없어요.</p>';
      return;
    }
    blocks.forEach((b) => {
      const meta = CATEGORY_META[b.category] || CATEGORY_META.etc;
      const chip = document.createElement('div');
      chip.className = 'day-event-chip';
      chip.innerHTML = `<span class="dot" style="background:${meta.color}"></span><p></p><span class="time">${b.start} - ${b.end}</span>`;
      chip.querySelector('p').textContent = b.title;
      calDayEvents.appendChild(chip);
    });
  }

  // ---------- Render: Timetable view ----------
  function renderTimetable() {
    const dateKey = toKey(selectedDate);
    const blocks = [...getBlocks(dateKey)].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    ttAxis.innerHTML = ['06', '09', '12', '15', '18', '21', '24'].map((h) => `<span>${h}</span>`).join('');

    const totalMin = blocks.reduce((sum, b) => sum + (timeToMinutes(b.end) - timeToMinutes(b.start)), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    ttSummary.textContent = totalMin > 0
      ? `오늘 총 ${h > 0 ? h + '시간 ' : ''}${m > 0 ? m + '분 ' : ''}활동`
      : '오늘 등록된 활동이 없어요';

    ttRows.innerHTML = '';
    if (blocks.length === 0) {
      ttRows.innerHTML = '<p class="empty-state">+ 버튼으로 일정을 추가해보세요.</p>';
    }
    blocks.forEach((b) => {
      const meta = CATEGORY_META[b.category] || CATEGORY_META.etc;
      const startMin = timeToMinutes(b.start);
      const endMin = timeToMinutes(b.end);
      const leftPct = (startMin / 1440) * 100;
      const widthPct = Math.max(((endMin - startMin) / 1440) * 100, 1.2);

      const row = document.createElement('div');
      row.className = 'tt-row';
      row.innerHTML = `
        <span class="tt-row-label"></span>
        <div class="tt-track">
          <div class="tt-bar" style="left:${leftPct}%; width:${widthPct}%; background:${meta.color};" title="${b.start} - ${b.end}"></div>
        </div>
        <button class="todo-delete" aria-label="삭제"><i class="ti ti-x" aria-hidden="true"></i></button>
      `;
      row.querySelector('.tt-row-label').textContent = b.title;
      row.querySelector('.todo-delete').addEventListener('click', () => {
        state.blocks[dateKey] = getBlocks(dateKey).filter((x) => x.id !== b.id);
        saveState();
        renderTimetable();
        renderHeader();
      });
      ttRows.appendChild(row);
    });

    // 진행중인 일정
    const now = new Date();
    let current = null;
    if (isSameDay(selectedDate, now)) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      current = blocks.find((b) => timeToMinutes(b.start) <= nowMin && nowMin < timeToMinutes(b.end));
    }
    if (current) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const elapsed = nowMin - timeToMinutes(current.start);
      ttNowText.textContent = `지금: ${current.title} · ${elapsed}분 경과`;
    } else {
      ttNowText.textContent = '지금 진행중인 일정 없음';
    }

    // legend: 사용된 카테고리만
    const usedCats = [...new Set(blocks.map((b) => b.category))];
    const catsToShow = usedCats.length > 0 ? usedCats : Object.keys(CATEGORY_META);
    ttLegend.innerHTML = catsToShow.map((c) => {
      const meta = CATEGORY_META[c] || CATEGORY_META.etc;
      return `<span class="legend-item"><span class="sw" style="background:${meta.color}"></span>${meta.label}</span>`;
    }).join('');
  }

  // ---------- Tab switching ----------
  function switchTab(tab) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== tab));
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ---------- Todo sheet ----------
  const todoSheetBackdrop = $('#todo-sheet-backdrop');
  const todoInput = $('#todo-input');
  const todoImportant = $('#todo-important');

  $('#add-todo-btn').addEventListener('click', () => {
    todoInput.value = '';
    todoImportant.checked = false;
    todoSheetBackdrop.classList.add('open');
    setTimeout(() => todoInput.focus(), 50);
  });
  $('#todo-cancel').addEventListener('click', () => todoSheetBackdrop.classList.remove('open'));
  todoSheetBackdrop.addEventListener('click', (e) => {
    if (e.target === todoSheetBackdrop) todoSheetBackdrop.classList.remove('open');
  });
  $('#todo-save').addEventListener('click', () => {
    const text = todoInput.value.trim();
    if (!text) {
      todoInput.style.borderColor = '#E24B4A';
      todoInput.placeholder = '할일을 입력해주세요';
      return;
    }
    const dateKey = toKey(selectedDate);
    if (!state.todos[dateKey]) state.todos[dateKey] = [];
    state.todos[dateKey].push({ id: uid(), text, done: false, important: todoImportant.checked });
    saveState();
    todoSheetBackdrop.classList.remove('open');
    renderTodoList();
    renderHeader();
  });

  // ---------- Block sheet ----------
  const blockSheetBackdrop = $('#block-sheet-backdrop');
  const blockTitle = $('#block-title');
  const blockStart = $('#block-start');
  const blockEnd = $('#block-end');
  const blockCategory = $('#block-category');
  const blockError = $('#block-error');

  function openBlockSheet() {
    blockTitle.value = '';
    blockStart.value = '09:00';
    blockEnd.value = '10:00';
    blockCategory.value = 'work';
    blockError.classList.add('hidden');
    blockSheetBackdrop.classList.add('open');
    setTimeout(() => blockTitle.focus(), 50);
  }
  $('#add-block-btn').addEventListener('click', openBlockSheet);
  $('#block-cancel').addEventListener('click', () => blockSheetBackdrop.classList.remove('open'));
  blockSheetBackdrop.addEventListener('click', (e) => {
    if (e.target === blockSheetBackdrop) blockSheetBackdrop.classList.remove('open');
  });
  $('#block-save').addEventListener('click', () => {
    const title = blockTitle.value.trim();
    const start = blockStart.value;
    const end = blockEnd.value;
    if (!title || !start || !end || timeToMinutes(end) <= timeToMinutes(start)) {
      blockError.textContent = !title ? '일정 제목을 입력해주세요' : '종료 시간이 시작 시간보다 늦어야 해요';
      blockError.classList.remove('hidden');
      return;
    }
    blockError.classList.add('hidden');
    const dateKey = toKey(selectedDate);
    if (!state.blocks[dateKey]) state.blocks[dateKey] = [];
    state.blocks[dateKey].push({ id: uid(), title, start, end, category: blockCategory.value });
    saveState();
    blockSheetBackdrop.classList.remove('open');
    renderTimetable();
    renderHeader();
  });

  // ---------- Calendar nav ----------
  $('#cal-prev').addEventListener('click', () => {
    calViewMonth = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    calViewMonth = new Date(calViewMonth.getFullYear(), calViewMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  // ---------- Render all ----------
  function renderAll() {
    renderHeader();
    renderWeekStrip();
    renderTodoList();
    renderCalendar();
    renderTimetable();
  }
  renderAll();

  // ---------- Seed sample data on first run ----------
  if (Object.keys(state.todos).length === 0 && Object.keys(state.blocks).length === 0) {
    const todayKey = toKey(new Date());
    state.todos[todayKey] = [
      { id: uid(), text: '아침 러닝 30분', done: true, important: false },
      { id: uid(), text: '이메일 회신', done: true, important: false },
      { id: uid(), text: 'Flutter 프로젝트 구조 잡기', done: false, important: true },
      { id: uid(), text: '저녁 장보기', done: false, important: false }
    ];
    state.blocks[todayKey] = [
      { id: uid(), title: '아침 러닝', start: '07:00', end: '07:40', category: 'exercise' },
      { id: uid(), title: '업무 집중', start: '09:00', end: '11:30', category: 'work' },
      { id: uid(), title: '점심 약속', start: '12:30', end: '13:20', category: 'social' },
      { id: uid(), title: 'Flutter 개발', start: '14:00', end: '15:50', category: 'dev' },
      { id: uid(), title: '저녁 장보기', start: '19:00', end: '19:20', category: 'etc' }
    ];
    saveState();
    renderAll();
  }

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW 등록 실패', err));
    });
  }
})();
