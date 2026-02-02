/**
 * Sample Report Styles - 样本报告专用样式
 */

export const SAMPLE_REPORT_STYLES = `
<style>
  .scrollable-table {
    max-height: 500px;
    overflow-y: auto;
    margin: 15px 0;
  }
  .scrollable-table table {
    margin: 0;
  }
  .scrollable-table thead th {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #3498db;
  }
  .trade-win { background: rgba(39, 174, 96, 0.1); }
  .trade-loss { background: rgba(231, 76, 60, 0.1); }
  .observing { background: rgba(128, 128, 128, 0.15); }
  .event-tp { color: #27ae60; font-weight: bold; }
  .event-sl { color: #e74c3c; font-weight: bold; }
  .event-obs { color: #888; }
  .csv-download {
    display: inline-block;
    padding: 8px 16px;
    background: #3498db;
    color: white;
    border-radius: 6px;
    text-decoration: none;
    font-size: 14px;
    margin: 10px 0;
  }
  .csv-download:hover { background: #2980b9; }
  .collapsible {
    cursor: pointer;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 8px;
    margin-top: 15px;
  }
  .collapsible:hover { background: #e9ecef; }
  .content { display: none; }
  .content.active { display: block; }
  .signal-long { color: #27ae60; font-weight: bold; }
  .signal-short { color: #e74c3c; font-weight: bold; }
  .signal-flat { color: #888; }
</style>
`;

export const SAMPLE_REPORT_SCRIPT = `
<script>
  function toggleContent(id) {
    const content = document.getElementById(id);
    content.classList.toggle('active');
  }
</script>
`;
