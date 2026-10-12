const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('ko-KR');
let currentFile = null;
let currentResult = null;

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const sampleBtn = $('#sampleBtn');
const profileBtn = $('#profileBtn');

function setStatus(message, state = '') {
  const element = $('#status');
  element.textContent = message;
  element.className = `status ${state}`.trim();
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return number.format(value);
  return String(value);
}

function appendText(parent, tag, value, className = '') {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

async function analyzeFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    setStatus('CSV 파일을 선택해 주세요.', 'error');
    return;
  }
  currentFile = file;
  currentResult = null;
  sampleBtn.disabled = true;
  setStatus(`${file.name} 분석 중 · 데이터 상태와 이상치 후보를 살펴보고 있습니다.`, 'loading');
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || '분석에 실패했습니다.');
    currentResult = body;
    renderResults(body);
    setStatus(`${file.name} · 분석 완료. 업로드한 파일은 서버에 저장되지 않았습니다.`);
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(error.message || '분석 중 문제가 발생했습니다.', 'error');
  } finally {
    sampleBtn.disabled = false;
  }
}

function renderInsights(items) {
  const container = $('#insights');
  container.replaceChildren();
  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'insight';
    const top = appendText(card, 'div', '', 'insight-top');
    appendText(top, 'span', item.type, 'insight-type');
    appendText(top, 'span', String(index + 1).padStart(2, '0'), 'insight-index');
    appendText(card, 'h4', item.title);
    appendText(card, 'p', item.detail);
    appendText(card, 'div', item.evidence, 'insight-evidence');
    container.append(card);
  });
}

function showChart(column) {
  $('#chartType').textContent = column.kind.toUpperCase();
  $('#chartTitle').textContent = column.name;
  $('#chartMeta').textContent = `${number.format(column.unique)}개 고유값 · ${number.format(column.missing)}개 결측${column.chart.note ? ` · ${column.chart.note}` : ''}`;
  const container = $('#chart');
  container.replaceChildren();
  const labels = column.chart.labels;
  const values = column.chart.values;
  if (!values.length) {
    appendText(container, 'div', '표시할 값이 없습니다.', 'chart-empty');
    return;
  }
  const max = Math.max(...values, 1);
  values.forEach((value, index) => {
    const group = appendText(container, 'div', '', 'chart-bar-group');
    appendText(group, 'span', number.format(value), 'chart-value');
    const bar = appendText(group, 'div', '', 'chart-bar');
    bar.style.height = `${Math.max(4, (value / max) * 195)}px`;
    bar.title = `${labels[index]}: ${number.format(value)}개`;
    appendText(group, 'span', labels[index], 'chart-label').title = labels[index];
  });
}

function renderColumnTabs(columns) {
  const container = $('#columnTabs');
  container.replaceChildren();
  const initialColumn = columns.find((column) => column.kind === 'number') || columns[0];
  columns.forEach((column, index) => {
    const button = appendText(container, 'button', column.name);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', column === initialColumn ? 'true' : 'false');
    if (column === initialColumn) button.classList.add('active');
    button.addEventListener('click', () => {
      container.querySelectorAll('button').forEach((tab) => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      });
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      showChart(column);
    });
  });
  if (initialColumn) showChart(initialColumn);
}

function renderTable(containerSelector, rows, columns, isAnomaly = false) {
  const container = $(containerSelector);
  container.replaceChildren();
  if (!rows.length) {
    appendText(container, 'div', isAnomaly ? '이상치 모델을 실행할 수 없거나 확인할 행이 없습니다.' : '미리 볼 행이 없습니다.', 'empty-table');
    return;
  }
  const table = document.createElement('table');
  table.className = 'data-table';
  const header = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const labels = isAnomaly ? ['CSV 행', '점수', ...columns] : ['#', ...columns];
  labels.forEach((label) => appendText(headerRow, 'th', label));
  header.append(headerRow);
  const body = document.createElement('tbody');
  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (isAnomaly) {
      appendText(tr, 'td', number.format(row.row_number));
      appendText(tr, 'td', row.score.toFixed(2), 'score');
      columns.forEach((name) => appendText(tr, 'td', formatValue(row.values[name])));
    } else {
      appendText(tr, 'td', String(index + 1));
      columns.forEach((name) => appendText(tr, 'td', formatValue(row[name])));
    }
    body.append(tr);
  });
  table.append(header, body);
  container.append(table);
}

function renderResults(result) {
  $('#results').classList.remove('hidden');
  $('#fileName').textContent = result.filename;
  $('#metricRows').textContent = number.format(result.summary.rows);
  $('#metricColumns').textContent = number.format(result.summary.columns);
  $('#metricMissing').textContent = number.format(result.summary.missing_cells);
  $('#metricAnomalies').textContent = number.format(result.summary.anomaly_rows);
  $('#enginePill').textContent = result.engines.join(' · ');
  $('#anomalyCaption').textContent = result.anomaly_features.length
    ? `${result.anomaly_features.join(', ')} 열을 비교했습니다. 높은 점수일수록 다른 패턴이며, 오류라고 단정할 수는 없습니다.`
    : '분석 가능한 수치 열이 2개 이상이고 데이터가 30행 이상일 때 AI 이상탐지를 실행합니다.';
  renderInsights(result.insights);
  renderColumnTabs(result.columns);
  const focused = result.anomaly_features.length ? result.anomaly_features.slice(0, 6) : result.columns.slice(0, 6).map((item) => item.name);
  renderTable('#anomalyTable', result.anomalies, focused, true);
  renderTable('#previewTable', result.preview, result.columns.map((item) => item.name));
}

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragging');
  analyzeFile(event.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => analyzeFile(fileInput.files[0]));
sampleBtn.addEventListener('click', async () => {
  try {
    setStatus('가상 데이터를 불러오는 중입니다.', 'loading');
    const response = await fetch('/api/sample');
    if (!response.ok) throw new Error('샘플 데이터를 불러오지 못했습니다.');
    const blob = await response.blob();
    await analyzeFile(new File([blob], 'demo_orders.csv', { type: 'text/csv' }));
  } catch (error) { setStatus(error.message, 'error'); }
});
profileBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  profileBtn.disabled = true;
  profileBtn.textContent = '프로파일 생성 중…';
  const form = new FormData();
  form.append('file', currentFile);
  try {
    const response = await fetch('/api/profile', { method: 'POST', body: form });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.detail || '프로파일을 만들지 못했습니다.');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'data-profile.html';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    setStatus('fg-data-profiling으로 생성한 전체 HTML 보고서를 저장했습니다.');
  } catch (error) { setStatus(error.message, 'error'); }
  finally {
    profileBtn.disabled = false;
    profileBtn.innerHTML = '전체 프로파일 HTML 저장 <span>↗</span>';
  }
});
