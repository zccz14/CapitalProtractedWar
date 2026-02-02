/**
 * Visualization Module Styles - 通用样式常量
 */

export const COMMON_STYLES = `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #f5f5f5;
    color: #333;
    line-height: 1.6;
    padding: 20px;
  }
  .container { max-width: 1400px; margin: 0 auto; }
  h1 { text-align: center; margin-bottom: 10px; color: #2c3e50; font-size: 28px; }
  h2 { margin: 30px 0 15px; color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
  h3 { margin: 20px 0 10px; color: #2c3e50; }
  .subtitle { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
  
  .card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .nav-breadcrumb {
    background: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .nav-breadcrumb a { color: #3498db; text-decoration: none; }
  .nav-breadcrumb a:hover { text-decoration: underline; }
  .nav-breadcrumb span { color: #7f8c8d; margin: 0 8px; }
  
  .grid { display: grid; gap: 20px; }
  .grid-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
  .grid-3 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  .grid-4 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 15px 0;
    font-size: 14px;
  }
  th, td {
    padding: 12px;
    text-align: center;
    border-bottom: 1px solid #eee;
  }
  th { background: #3498db; color: white; font-weight: 600; }
  tr:hover { background: #f8f9fa; }
  
  .link-card {
    display: block;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 12px;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .link-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
  }
  .link-card h4 { font-size: 18px; margin-bottom: 8px; }
  .link-card p { opacity: 0.9; font-size: 14px; }
  
  .metric-card {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .metric-card .value { font-size: 28px; font-weight: bold; color: #2c3e50; }
  .metric-card .label { font-size: 12px; color: #7f8c8d; margin-top: 4px; }
  
  .chart-container { text-align: center; margin: 20px 0; overflow-x: auto; }
  
  .tag {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }
  .tag-green { background: #d4edda; color: #155724; }
  .tag-blue { background: #cce5ff; color: #004085; }
  .tag-yellow { background: #fff3cd; color: #856404; }
  .tag-red { background: #f8d7da; color: #721c24; }
  
  footer {
    text-align: center;
    color: #7f8c8d;
    margin-top: 40px;
    padding: 20px;
    border-top: 1px solid #eee;
  }
</style>
`;
