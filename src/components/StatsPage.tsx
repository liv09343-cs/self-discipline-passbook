import { useApp } from '../store/AppStore';
import { computeMetrics, dayDetails, heatmap30 } from '../lib/stats';
import { formatCoins } from '../lib/money';
import {
  WEEKDAY_CN,
  formatCnDateWithWeek,
  formatMinutes,
  formatTime,
} from '../lib/date';

export function StatsPage() {
  const { book } = useApp();
  const metrics = computeMetrics(book);
  const heat = heatmap30(book);
  const details = dayDetails(book);
  const offset = heat[0]?.date.getDay() ?? 0;
  const heatTotal = heat.reduce((sum, day) => sum + day.minutes, 0);

  const tiles = [
    {
      label: '累计专注',
      value: formatMinutes(metrics.totalMinutes),
      sub: '所有已结算记录',
    },
    {
      label: '今日专注',
      value: formatMinutes(metrics.todayMinutes),
      sub: '零点至今',
    },
    {
      label: '本周专注',
      value: formatMinutes(metrics.weekMinutes),
      sub: '最近 7 天',
    },
    {
      label: '连续自律',
      value: `${metrics.streak} 天`,
      sub: '别让存折断档',
    },
    {
      label: '累计存入',
      value: `${formatCoins(metrics.coinsIn)} 枚`,
      sub: '含开户礼',
    },
    {
      label: '累计支取',
      value: `${formatCoins(metrics.coinsOut)} 枚`,
      sub: '兑换延迟满足',
    },
    {
      label: '兑换次数',
      value: `${metrics.redeemCount} 次`,
      sub: `星星 ${metrics.stars} 颗`,
    },
    {
      label: 'DDL 完成率',
      value: `${metrics.ddlRate}%`,
      sub: `${metrics.ddlDone} / ${metrics.ddlTotal} 项已完成`,
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">统计报表</h2>
          <p className="page-sub">
            「{book.name}」的八项指标、近 30 天专注热力与逐日明细。
          </p>
        </div>
        <span className="tag tag-brown">数据只统计当前账本</span>
      </div>

      <div className="stat-grid">
        {tiles.map((tile) => (
          <div className="stat-tile" key={tile.label}>
            <div className="stat-tile-label">{tile.label}</div>
            <div className="stat-tile-value">{tile.value}</div>
            <div className="stat-tile-sub">{tile.sub}</div>
          </div>
        ))}
      </div>

      <section className="panel stats-panel">
        <h3 className="panel-title">近 30 天专注热力</h3>
        <p className="panel-sub">
          共 {formatMinutes(heatTotal)}，颜色越深代表当日专注越久。
        </p>
        <div className="heat-grid">
          {WEEKDAY_CN.map((weekday) => (
            <div className="heat-dow" key={weekday}>
              {weekday}
            </div>
          ))}
          {Array.from({ length: offset }).map((_, index) => (
            <div className="heat-cell is-empty" key={`pad-${index}`} />
          ))}
          {heat.map((day) => (
            <div
              className={`heat-cell l${day.level}`}
              key={day.key}
              title={`${day.date.getMonth() + 1} 月 ${day.date.getDate()} 日 · ${formatMinutes(
                day.minutes,
              )}`}
            >
              <span className="heat-day">{day.date.getDate()}</span>
            </div>
          ))}
        </div>
        <div className="heat-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span className={`heat-swatch l${level}`} key={level} />
          ))}
          <span>多</span>
        </div>
      </section>

      <section className="panel stats-panel">
        <h3 className="panel-title">专注明细</h3>
        <p className="panel-sub">按日期倒序展开每一段自律记录。</p>
        {details.length === 0 ? (
          <div className="empty">
            <span className="empty-glyph">空</span>
            这本存折还没有专注记录。
            <br />
            去「存入」完成第一次计时，统计就会长出来。
          </div>
        ) : (
          <div className="detail-list">
            {details.map((group) => (
              <div className="detail-day" key={group.key}>
                <div className="detail-day-head">
                  <span>{formatCnDateWithWeek(group.date.toISOString())}</span>
                  <span className="detail-day-sum">
                    {formatMinutes(group.minutes)} · +{formatCoins(group.coins)} 枚
                    {group.stars > 0 ? ` · ★ ${group.stars}` : ''}
                  </span>
                </div>
                {group.sessions.map((session) => (
                  <div className="detail-session" key={session.id}>
                    <span className="detail-subject">{session.subjectName}</span>
                    <span>{formatMinutes(session.durationMs / 60000)}</span>
                    <span className="amt-in">
                      +{formatCoins(session.coins)} 枚
                    </span>
                    <span className="muted">
                      {formatTime(session.endedAt)}
                      {session.note ? ` · ${session.note}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}