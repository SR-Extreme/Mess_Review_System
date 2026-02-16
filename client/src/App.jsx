import React, { useEffect, useState } from 'react';

// You can override this by creating `client/.env` with:
// VITE_API_BASE=http://localhost:5001
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

const RANGE_OPTIONS = [
  { id: 'daily', label: 'Today' },
  { id: 'weekly', label: 'Last 7 days' },
  { id: 'monthly', label: 'Last 30 days' },
];

// Helper function to format date as "Feb 3, 2026"
const formatDate = (date) => {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Helper function to get date range string based on selected range.
// This mirrors the backend logic, which always ends ranges on "yesterday".
const getDateRangeString = (rangeType) => {
  const today = new Date();
  // "end" is yesterday (last fully completed day)
  const end = new Date(today);
  end.setDate(end.getDate() - 1);

  if (rangeType === 'daily') {
    return formatDate(end);
  } else if (rangeType === 'weekly') {
    const startDate = new Date(end);
    startDate.setDate(end.getDate() - 6);
    return `${formatDate(startDate)} - ${formatDate(end)}`;
  } else if (rangeType === 'monthly') {
    const startDate = new Date(end);
    startDate.setDate(end.getDate() - 29);
    return `${formatDate(startDate)} - ${formatDate(end)}`;
  }
  return '';
};

function App() {
  const [messes, setMesses] = useState([]);
  const [selectedMess, setSelectedMess] = useState('');
  const [range, setRange] = useState('daily');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [totalStrength, setTotalStrength] = useState('');

  // Debug: log every key state transition
  useEffect(() => {
    console.log('[config] API_BASE =', API_BASE);
  }, []);
  useEffect(() => console.log('[state] messes =', messes), [messes]);
  useEffect(() => console.log('[state] selectedMess =', selectedMess), [selectedMess]);
  useEffect(() => console.log('[state] range =', range), [range]);
  useEffect(() => console.log('[state] loading =', loading), [loading]);
  useEffect(() => console.log('[state] error =', error), [error]);
  useEffect(() => console.log('[state] summary =', summary), [summary]);

  // Fetch list of messes (e.g. "Mess A", "Mess B")
  useEffect(() => {
    async function fetchMesses() {
      try {
        console.log('[fetch] /api/messes -> start');
        const res = await fetch(`${API_BASE}/api/messes`);
        console.log('[fetch] /api/messes -> status', res.status);
        if (!res.ok) throw new Error('Failed to load mess list');
        const data = await res.json();
        console.log('[fetch] /api/messes -> data', data);
        setMesses(data);
        if (data.length > 0) {
          setSelectedMess(data[0]);
        }
      } catch (err) {
        console.error(err);
        setError('Could not load mess list. Check API server.');
      }
    }
    fetchMesses();
  }, []);

  // Fetch summary whenever mess or range changes
  useEffect(() => {
    if (!selectedMess) return;

    async function fetchSummary() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ mess: selectedMess, range });
        const url = `${API_BASE}/api/summary?${params.toString()}`;
        console.log('[fetch] /api/summary -> start', url);
        const res = await fetch(url);
        console.log('[fetch] /api/summary -> status', res.status);
        if (!res.ok) throw new Error('Failed to load summary');
        const data = await res.json();
        console.log('[fetch] /api/summary -> data', data);
        setSummary(data);
      } catch (err) {
        console.error(err);
        setError('Could not load performance data. Check API server.');
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, [selectedMess, range]);

  // Build a list of all calendar dates between start and end (inclusive)
  const buildDateList = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return [];
    const dates = [];
    const start = new Date(`${startDateStr}T00:00:00`);
    const end = new Date(`${endDateStr}T00:00:00`);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  };

  // Prepare structures for per-day graphs and "bad day" (> 50% bad) counts
  let dateList = [];
  let dayDataMap = new Map();
  let badDayCounts = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    overall: 0,
  };

  const totalStrengthNum = Number(totalStrength) || 0;

  if (summary && summary.startDate && summary.endDate) {
    dateList = buildDateList(summary.startDate, summary.endDate);

    // For weekly, ensure we only show exactly 7 days of cards
    // even if the backend returns an extra boundary day.
    if (range === 'weekly' && dateList.length > 7) {
      dateList = dateList.slice(dateList.length - 7);
    }

    if (Array.isArray(summary.days)) {
      dayDataMap = new Map(summary.days.map((d) => [d.date, d]));
    }

    if (totalStrengthNum > 0 && dateList.length > 0) {
      const thresholdPerMeal = 0.5 * totalStrengthNum;
      const thresholdOverall = 1.5 * totalStrengthNum; // 50% of 3 * totalStrength

      dateList.forEach((dateStr) => {
        const dayEntry = dayDataMap.get(dateStr);
        const mealsArr = dayEntry?.meals || [];
        const mealMap = {};
        mealsArr.forEach((m) => {
          if (m?.meal) {
            mealMap[m.meal.toLowerCase()] = m;
          }
        });

        const breakfast = mealMap.breakfast || { goodCount: 0, badCount: 0 };
        const lunch = mealMap.lunch || { goodCount: 0, badCount: 0 };
        const dinner = mealMap.dinner || { goodCount: 0, badCount: 0 };

        const overallBad =
          (breakfast.badCount || 0) +
          (lunch.badCount || 0) +
          (dinner.badCount || 0);

        if ((breakfast.badCount || 0) > thresholdPerMeal) {
          badDayCounts.breakfast += 1;
        }
        if ((lunch.badCount || 0) > thresholdPerMeal) {
          badDayCounts.lunch += 1;
        }
        if ((dinner.badCount || 0) > thresholdPerMeal) {
          badDayCounts.dinner += 1;
        }
        if (overallBad > thresholdOverall) {
          badDayCounts.overall += 1;
        }
      });
    }
  }

  // Build human-readable labels for the active range based on actual summary dates,
  // so that "Last X days" matches the range length card below.
  const rangeLabelText = (() => {
    if (!summary || !summary.startDate || !summary.endDate) {
      if (range === 'daily') return 'Today';
      if (range === 'weekly') return 'Last 7 days';
      if (range === 'monthly') return 'Last 30 days';
      return '';
    }

    const start = new Date(`${summary.startDate}T00:00:00`);
    const end = new Date(`${summary.endDate}T00:00:00`);

    const diffMs = end.getTime() - start.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    if (range === 'daily') {
      return formatDate(end);
    }

    if (range === 'weekly' || range === 'monthly') {
      return `Last ${days} days`;
    }

    return '';
  })();

  const rangeDateText = (() => {
    if (!summary || !summary.startDate || !summary.endDate) {
      return getDateRangeString(range);
    }

    const start = new Date(`${summary.startDate}T00:00:00`);
    const end = new Date(`${summary.endDate}T00:00:00`);

    // If the range is just a single day (e.g. daily), show that day once.
    if (summary.startDate === summary.endDate) {
      return formatDate(end);
    }

    return `${formatDate(start)} - ${formatDate(end)}`;
  })();

  return (
    <div className="app">
      <header className="header">
        <h1>Mess Review Dashboard</h1>
        <p>Compare performance of Mess A and Mess B for breakfast, lunch and dinner.</p>
      </header>

      <main>
        <section className="filters">
          <div className="filter-group">
            <label htmlFor="mess-select">Mess</label>
            <select
              id="mess-select"
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
            <span>Time range</span>
            <div className="range-buttons">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={range === opt.id ? 'range-btn active' : 'range-btn'}
                  onClick={() => setRange(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="strength-input">Total strength (students)</label>
            <div className="strength-input-wrapper">
              <input
                id="strength-input"
                type="number"
                min="0"
                value={totalStrength}
                onChange={(e) => setTotalStrength(e.target.value)}
                placeholder="Enter total strength for this mess"
              />
              {totalStrengthNum > 0 && (
                <span className="strength-chip">
                  {totalStrengthNum} expected responses / meal
                </span>
              )}
            </div>
            <p className="field-help">
              Used to calculate % of bad days and expected responses.
            </p>
          </div>
        </section>

        {loading && <div className="info">Loading data…</div>}
        {error && <div className="error">{error}</div>}

        {summary && !loading && (
          <section className="summary-section">
            <div className="summary-header">
              <h2>
                {summary.mess} – {rangeLabelText}
              </h2>
              <p className="date-range">
                {rangeDateText}
              </p>
            </div>

            {(!summary.days || summary.days.length === 0) && (
              <div className="info">No reviews in this period for this mess.</div>
            )}

            {summary.days && summary.days.length > 0 && (
              <>
                {totalStrengthNum > 0 && dateList.length > 0 && (
                  <div className="bad-days-summary card">
                    <h3 className="card-title">Days with &gt; 50% bad votes</h3>
                    <p className="card-total">
                      <span className="card-total-label">Range length</span>
                      <span className="card-total-value">{dateList.length} days</span>
                    </p>
                    <div className="card-metrics">
                      <div>
                        <span className="metric-label">Breakfast</span>
                        <span className="metric-value">
                          {badDayCounts.breakfast} / {dateList.length}
                        </span>
                      </div>
                      <div>
                        <span className="metric-label">Lunch</span>
                        <span className="metric-value">
                          {badDayCounts.lunch} / {dateList.length}
                        </span>
                      </div>
                      <div>
                        <span className="metric-label">Dinner</span>
                        <span className="metric-value">
                          {badDayCounts.dinner} / {dateList.length}
                        </span>
                      </div>
                      <div>
                        <span className="metric-label">Overall</span>
                        <span className="metric-value">
                          {badDayCounts.overall} / {dateList.length}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="day-graphs">
                  {dateList.map((dateStr) => {
                    const dayEntry = dayDataMap.get(dateStr);
                    const mealsArr = dayEntry?.meals || [];
                    const mealMap = {};
                    mealsArr.forEach((m) => {
                      if (m?.meal) {
                        mealMap[m.meal.toLowerCase()] = m;
                      }
                    });

                    const breakfast = mealMap.breakfast || {
                      totalReviews: 0,
                      goodCount: 0,
                      badCount: 0,
                    };
                    const lunch = mealMap.lunch || {
                      totalReviews: 0,
                      goodCount: 0,
                      badCount: 0,
                    };
                    const dinner = mealMap.dinner || {
                      totalReviews: 0,
                      goodCount: 0,
                      badCount: 0,
                    };

                    const overallGood =
                      (breakfast.goodCount || 0) +
                      (lunch.goodCount || 0) +
                      (dinner.goodCount || 0);
                    const overallBad =
                      (breakfast.badCount || 0) +
                      (lunch.badCount || 0) +
                      (dinner.badCount || 0);

                    const bars = [
                      {
                        key: 'breakfast',
                        label: 'Breakfast',
                        good: breakfast.goodCount || 0,
                        bad: breakfast.badCount || 0,
                        base: totalStrengthNum,
                      },
                      {
                        key: 'lunch',
                        label: 'Lunch',
                        good: lunch.goodCount || 0,
                        bad: lunch.badCount || 0,
                        base: totalStrengthNum,
                      },
                      {
                        key: 'dinner',
                        label: 'Dinner',
                        good: dinner.goodCount || 0,
                        bad: dinner.badCount || 0,
                        base: totalStrengthNum,
                      },
                      {
                        key: 'overall',
                        label: 'Overall',
                        good: overallGood,
                        bad: overallBad,
                        base: totalStrengthNum > 0 ? 3 * totalStrengthNum : 0,
                      },
                    ];

                    const displayDate = (() => {
                      const d = new Date(`${dateStr}T00:00:00`);
                      d.setDate(d.getDate() + 1);
                      return formatDate(d);
                    })();

                    return (
                      <div key={dateStr} className="card day-card">
                        <h3 className="card-title">{displayDate}</h3>
                        <div className="day-card-content">
                          <div className="vertical-bars">
                            {bars.map((bar) => {
                              const base = bar.base || 0;
                              const goodPercent =
                                base > 0 ? ((bar.good || 0) / base) * 100 : 0;
                              const badPercent =
                                base > 0 ? ((bar.bad || 0) / base) * 100 : 0;
                              const totalVotes = (bar.good || 0) + (bar.bad || 0);

                              return (
                                <div key={bar.key} className="vertical-bar-item">
                                  <div className="vertical-bar">
                                    <div
                                      className="vertical-bar-good"
                                      style={{ height: `${goodPercent}%` }}
                                    />
                                    <div
                                      className="vertical-bar-bad"
                                      style={{ height: `${badPercent}%` }}
                                    />
                                  </div>
                                  <div className="vertical-bar-label">
                                    {bar.label}
                                  </div>
                                  <div className="vertical-bar-stats">
                                    <span>
                                      Good {bar.good} / Bad {bar.bad}
                                    </span>
                                    {base > 0 && (
                                      <span>
                                        {' '}
                                        ({totalVotes} responses,{' '}
                                        {badPercent.toFixed(1)}% bad of expected{' '}
                                        {base})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

