import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import './styles.css';

const MOCK_MESSES = ['Mess A', 'Mess B'];

const RANGE_OPTIONS = [
  { id: '1', label: '1 Day' },
  { id: '7', label: '7 Days' },
  { id: '30', label: '30 Days' },
];


// Calculates height based on a modified logarithmic scale.

const getLogHeight = (value) => {
  if (!value || value <= 0) return 0;

  // Math.log2(value) matches the intervals [1, 2, 4, 8... 2048]
  // We offset by 1 to make 0 the true starting point.
  const logVal = Math.log2(value) + 1;
  const percent = (logVal / 12) * 100;

  return Math.min(Math.max(percent, 0), 100);
};

// Helper function to format date as "Feb 3, 2026"
const formatDate = (date) => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Helper function to get date range string
const getDateRangeString = (rangeType, customDate) => {
  if (rangeType === 'custom' && customDate) {
    return formatDate(new Date(customDate));
  }

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1);

  if (rangeType === '1' || rangeType === 'daily') {
    return formatDate(end);
  } else if (rangeType === '7' || rangeType === 'weekly') {
    const startDate = new Date(end);
    startDate.setDate(end.getDate() - 6);
    return `${formatDate(startDate)} - ${formatDate(end)}`;
  } else if (rangeType === '30' || rangeType === 'monthly') {
    const startDate = new Date(end);
    startDate.setDate(end.getDate() - 29);
    return `${formatDate(startDate)} - ${formatDate(end)}`;
  }
  return '';
};

function App() {
  const [selectedMess, setSelectedMess] = useState('');
  const [range, setRange] = useState('7');
  const [customDate, setCustomDate] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [totalStrength, setTotalStrength] = useState('500');
  const [messes, setMesses] = useState(MOCK_MESSES);
  const [incidentData, setIncidentData] = useState(null);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState(null);

  useEffect(() => {
    const fetchMesses = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:5000/api/messes');
        if (response.data && response.data.length > 0) {
          setMesses(response.data);
          setSelectedMess(response.data[0]);
        }
      } catch (err) {
        console.error('Failed to fetch messes:', err);
        if (!selectedMess) setSelectedMess(MOCK_MESSES[0]);
      }
    };
    fetchMesses();
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!selectedMess) return;

    setLoading(true);
    setError(null);
    try {
      const params = { mess: selectedMess, range };
      if (range === 'custom' && customDate) {
        params.date = customDate;
      }

      const response = await axios.get('http://127.0.0.1:5000/api/summary', { params });
      setSummary(response.data);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to fetch dashboard data. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  }, [selectedMess, range, customDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const fetchIncidents = useCallback(async () => {
    if (!selectedMess) return;
    setIncidentLoading(true);
    setIncidentError(null);

    try {
      const params = { mess: selectedMess, range, thresholdPercent: 50 };
      if (range === 'custom' && customDate) {
        params.date = customDate;
      }
      const response = await axios.get('http://127.0.0.1:5000/api/incidents', { params });
      setIncidentData(response.data);
    } catch (err) {
      console.error('Incident fetch error:', err);
      setIncidentError('Could not load bad-review incidents.');
    } finally {
      setIncidentLoading(false);
    }
  }, [selectedMess, range, customDate]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const { dateList, dayDataMap, badDayCounts } = useMemo(() => {
    if (!summary || !summary.days || !Array.isArray(summary.days)) {
      return {
        dateList: [],
        dayDataMap: new Map(),
        badDayCounts: { breakfast: 0, lunch: 0, dinner: 0, overall: 0 }
      };
    }

    const days = summary.days;
    const map = new Map();
    const badCounts = { breakfast: 0, lunch: 0, dinner: 0, overall: 0 };

    days.forEach((day) => {
      const dateStr = day.date;
      map.set(dateStr, day);
    });

    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach(dateStr => {
      const day = map.get(dateStr);
      const meals = day.meals || [];
      let dayOverallGood = 0;
      let dayOverallBad = 0;

      const mealCounts = { breakfast: { g: 0, b: 0 }, lunch: { g: 0, b: 0 }, dinner: { g: 0, b: 0 } };

      meals.forEach(m => {
        const type = m.meal.toLowerCase();
        if (mealCounts[type]) {
          mealCounts[type].g += (m.goodCount || 0);
          mealCounts[type].b += (m.badCount || 0);
        }
        dayOverallGood += (m.goodCount || 0);
        dayOverallBad += (m.badCount || 0);
      });

      const threshold = Number(totalStrength || 0) * 0.5;
      if (mealCounts.breakfast.b > threshold) badCounts.breakfast++;
      if (mealCounts.lunch.b > threshold) badCounts.lunch++;
      if (mealCounts.dinner.b > threshold) badCounts.dinner++;
      if (dayOverallBad > threshold) badCounts.overall++;
    });

    return { dateList: sortedDates, dayDataMap: map, badDayCounts: badCounts };
  }, [summary, totalStrength]);

  const rangeDateText = getDateRangeString(range, customDate);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    if (newRange !== 'custom') setCustomDate('');
  };

  const exportIncidentStudents = () => {
    const students = incidentData?.studentIncidentSummary || [];
    if (!students.length) return;

    const headers = [
      'student_id',
      'name',
      'email',
      'hostel',
      'room_no',
      'department',
      'batch',
      'incident_count',
      'total_bad_votes_in_incidents',
    ];

    const esc = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const rows = students.map((s) =>
      [
        s.studentId,
        s.name,
        s.email,
        s.hostel,
        s.roomNo,
        s.department,
        s.batch,
        s.incidentCount,
        s.totalBadVotesInIncidents,
      ].map(esc).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident_students_${selectedMess.replace(/\s+/g, '_').toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1>Mess Review Dashboard</h1>
          <p>Tracking quality of service and student satisfaction across campus messes.</p>
        </div>
      </header>

      <main>
        <div className="filters card">
          <div className="filter-group">
            <span className="filter-label">Select Mess</span>
            <select
              value={selectedMess}
              onChange={(e) => setSelectedMess(e.target.value)}
            >
              {messes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <span className="filter-label">Time Period</span>
            <div className="range-buttons">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`range-btn ${range === opt.id ? 'active' : ''}`}
                  onClick={() => handleRangeChange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
              <input
                type="date"
                className={`date-picker-inline ${range === 'custom' ? 'active' : ''}`}
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setRange('custom');
                }}
              />
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-label">Student Capacity</span>
            <div className="strength-input-wrapper">
              <input
                type="number"
                value={totalStrength}
                onChange={(e) => setTotalStrength(e.target.value)}
                placeholder="Total Strength"
                min="0"
              />
              {totalStrength && <span className="strength-chip">{totalStrength} students</span>}
            </div>
          </div>
        </div>

        {loading && <div className="loading">Processing mess analytics...</div>}
        {error && <div className="error">{error}</div>}

        {!loading && !error && summary && (
          <section className="summary-section">
            <div className="summary-header">
              <div className="summary-title-row">
                <h2>Live Quality Report</h2>
              </div>
              <p>Performance metrics based on anonymous student feedback.</p>
              <div className="date-range-badge">
                {rangeDateText}
              </div>
            </div>

            {range !== '1' && range !== 'custom' && dateList.length > 0 && (
              <div className="card bad-days-card">
                {/* <div className="card-title">Alert: High Dissatisfaction</div> */}
                <p className="card-subtitle">
                  Number of days where "Bad" reviews exceeded 50% of Student Capacity over <span className="card-total-value">{dateList.length} days</span>
                </p>
                <div className="card-metrics">
                  <div className="metric-item">
                    <span className="metric-label">Breakfast</span>
                    <span className="metric-value">{badDayCounts.breakfast} / {dateList.length}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Lunch</span>
                    <span className="metric-value">{badDayCounts.lunch} / {dateList.length}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Dinner</span>
                    <span className="metric-value">{badDayCounts.dinner} / {dateList.length}</span>
                  </div>
                  <div className="metric-item highlight">
                    <span className="metric-label">Overall</span>
                    <span className="metric-value">{badDayCounts.overall} / {dateList.length}</span>
                  </div>
                </div>
              </div>
            )}

            {!incidentLoading && !incidentError && incidentData && (
              <div className="card incidents-card">
                <div className="incidents-header">
                  <div>
                    <h3>High Bad-Review Incidents (&gt;50%)</h3>
                    <p>
                      Showing only the date + meal where bad reviews crossed 50% of total votes.
                    </p>
                  </div>
                  <button
                    className="export-btn"
                    onClick={exportIncidentStudents}
                    disabled={!incidentData.studentIncidentSummary?.length}
                  >
                    Export Affected Students CSV
                  </button>
                </div>

                {incidentData.note && <div className="incident-note">{incidentData.note}</div>}

                {!incidentData.incidents?.length ? (
                  <div className="incident-empty">No incidents found for selected filters.</div>
                ) : (
                  <div className="incident-list">
                    {incidentData.incidents.map((incident) => (
                      <div
                        key={`${incident.date}-${incident.meal}`}
                        className="incident-item"
                      >
                        <span className="incident-date">{incident.date}</span>
                        <span className="incident-meal">{incident.meal}</span>
                        <span className="incident-stats">
                          Bad: {incident.badCount}/{incident.totalReviews} ({incident.badPercentage}%)
                        </span>
                        <span className="incident-students">
                          Affected students: {incident.students?.length || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!!incidentData.studentIncidentSummary?.length && (
                  <div className="incident-student-summary">
                    <h4>Students with repeated incidents (for refund analysis)</h4>
                    <div className="student-summary-list">
                      {incidentData.studentIncidentSummary.slice(0, 15).map((student, idx) => (
                        <div key={`${student.studentId || student.email || student.name || idx}`} className="student-summary-row">
                          <span>{student.name || 'Unknown Student'}</span>
                          <span>{student.studentId || '-'}</span>
                          <span>{student.incidentCount} incidents</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {incidentLoading && <div className="loading">Loading bad-review incidents...</div>}
            {incidentError && <div className="error">{incidentError}</div>}

            <div className="day-graphs">
              {dateList.map((dateStr) => {
                const dayEntry = dayDataMap.get(dateStr);
                const mealsArr = dayEntry?.meals || [];
                const mealMap = {};
                mealsArr.forEach((m) => {
                  if (m?.meal) mealMap[m.meal.toLowerCase()] = m;
                });

                const breakfast = mealMap.breakfast || { goodCount: 0, badCount: 0 };
                const lunch = mealMap.lunch || { goodCount: 0, badCount: 0 };
                const dinner = mealMap.dinner || { goodCount: 0, badCount: 0 };

                const overallGood = (breakfast.goodCount || 0) + (lunch.goodCount || 0) + (dinner.goodCount || 0);
                const overallBad = (breakfast.badCount || 0) + (lunch.badCount || 0) + (dinner.badCount || 0);

                const bars = [
                  { key: 'breakfast', label: 'Breakfast', fullLabel: 'Breakfast', good: breakfast.goodCount, bad: breakfast.badCount },
                  { key: 'lunch', label: 'Lunch', fullLabel: 'Lunch', good: lunch.goodCount, bad: lunch.badCount },
                  { key: 'dinner', label: 'Dinner', fullLabel: 'Dinner', good: dinner.goodCount, bad: dinner.badCount },
                  { key: 'overall', label: 'Overall', fullLabel: 'Total', good: overallGood, bad: overallBad },
                ];

                const displayDate = (() => {
                  const d = new Date(`${dateStr}T00:00:00`);
                  return formatDate(d);
                })();

                const yAxisLabels = [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0];

                return (
                  <div key={dateStr} className="card day-card compact">
                    <h3 className="card-title-compact">{displayDate}</h3>
                    <div className="day-card-content">
                      <div className="compact-chart-container">
                        <div className="y-axis-compact">
                          {yAxisLabels.map((l) => (
                            <div key={l} className="y-label-nano-wrapper">
                              <span className="y-label-nano">{l}</span>
                            </div>
                          ))}
                        </div>
                        <div className="chart-main-area">
                          <div className="vertical-axis-line" />
                          <div className="vertical-bars-compact">
                            {bars.map((bar) => {
                              const goodHeight = getLogHeight(bar.good);
                              const badHeight = getLogHeight(bar.bad);
                              return (
                                <div key={bar.key} className="bar-col-compact">
                                  <div className="bar-box-pair">
                                    <div className="bar-half">
                                      <div className="bar-seg-good side" style={{ height: `${goodHeight}%` }}>
                                        <div className="bubble-tooltip-nano">Good: {bar.good}</div>
                                      </div>
                                    </div>
                                    <div className="bar-half">
                                      <div className="bar-seg-bad side" style={{ height: `${badHeight}%` }}>
                                        <div className="bubble-tooltip-nano">Bad: {bar.bad}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="chart-labels-footer">
                        <div className="labels-spacer" /> {/* Matches y-axis width */}
                        <div className="labels-row">
                          {bars.map((bar) => (
                            <div key={bar.key} className="label-item">
                              <span className="bar-label-nano" title={bar.fullLabel}>{bar.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="day-footer-compact">{overallGood + overallBad} responses</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
