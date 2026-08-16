/**
 * 校招一键填写助手 - 引擎端到端测试（jsdom）
 * 运行：node test/engine.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'campus-autofill.user.js'), 'utf8');

const FORM_HTML = `<!DOCTYPE html><html><body>
<form id="app">
  <!-- 1. antd 风格：label[for] + id -->
  <div class="ant-form-item">
    <div class="ant-form-item-label"><label for="userName">姓名</label></div>
    <div class="ant-form-item-control"><input id="userName" type="text"></div>
  </div>
  <!-- 2. 最常见结构：label 与 input 同级 -->
  <div class="row"><label>手机号码</label><input id="phone" type="tel"></div>
  <div class="row"><label>出生日期</label><input id="birth" type="date"></div>
  <div class="row"><label>毕业院校</label><input id="school"></div>
  <div class="row"><label>毕业时间</label><input id="grad"></div>
  <!-- 3. 只有 placeholder -->
  <div><input id="email" placeholder="请输入邮箱"></div>
  <!-- 4. 原生下拉：学历（同义词匹配） -->
  <div class="row"><label>最高学历</label>
    <select id="degree"><option value="">请选择</option><option value="1">大学本科</option><option value="2">硕士研究生</option><option value="3">博士研究生</option></select>
  </div>
  <!-- 5. 原生下拉：政治面貌 -->
  <div class="row"><label>政治面貌</label>
    <select id="pol"><option value="">请选择</option><option value="a">中共党员</option><option value="b">共青团员</option><option value="c">群众</option></select>
  </div>
  <!-- 6. 单选组：性别 -->
  <div class="row" id="genderRow"><span>性别</span>
    <label><input type="radio" name="g" value="1">男</label>
    <label><input type="radio" name="g" value="2">女</label>
  </div>
  <!-- 7. 多行文本 -->
  <div class="row"><label>自我评价</label><textarea id="eval"></textarea></div>
  <!-- 8. 紧急联系人（不能和手机/姓名串位） -->
  <div class="row"><label>紧急联系人电话</label><input id="ecphone"></div>
  <!-- 9. 不该被填的 -->
  <div class="row"><label>验证码</label><input id="cap"><button type="button">获取验证码</button></div>
  <label><input type="checkbox" id="agree">同意条款</label>
</form>
</body></html>`;

const PROFILE = {
  name: '张三', gender: '男', birthdate: '2002-05-20', phone: '13800001234',
  email: 'zhangsan@example.com', political: '共青团员', ethnicity: '汉族',
  school: '杭州电子科技大学', grad_date: '2025-06', degree: '本科',
  self_eval: '基础扎实，动手能力强。', ec_phone: '13900005678',
};

(async () => {
  const dom = new JSDOM(FORM_HTML, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((r) => (window.document.readyState === 'complete' ? r() : window.addEventListener('load', r)));

  // jsdom 没有布局，stub 成可见
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 30, height: 20, top: 0, left: 0, right: 30, bottom: 20 };
  };

  // 预置资料（模拟用户已在面板保存过）
  window.localStorage.setItem('caf_profile', JSON.stringify(PROFILE));

  // 统计 React 式 input 事件
  let inputEvents = 0;
  window.document.getElementById('userName').addEventListener('input', () => inputEvents++);

  // 注入用户脚本
  window.eval(SRC);
  await new Promise((r) => setTimeout(r, 300));

  const doc = window.document;
  if (!doc.getElementById('caf-panel')) { console.error('✗ 面板未创建'); process.exit(1); }

  // 点击「一键填写」
  doc.querySelector('[data-act="fill"]').click();

  // 等待完成 toast
  const ok = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const el = doc.getElementById('caf-toast');
      if (el && /填写完成/.test(el.textContent)) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > 5000) { clearInterval(iv); resolve(false); }
    }, 100);
  });
  if (!ok) { console.error('✗ 填写流程未完成（超时）'); process.exit(1); }

  await new Promise((r) => setTimeout(r, 100));

  const $ = (id) => doc.getElementById(id);
  const checks = [
    ['姓名（label[for]）', $('userName').value === '张三'],
    ['姓名触发 input 事件（React 兼容）', inputEvents === 1],
    ['手机号码（同级 label）', $('phone').value === '13800001234'],
    ['出生日期（date 归一化）', $('birth').value === '2002-05-20'],
    ['毕业院校（不被当成毕业时间）', $('school').value === '杭州电子科技大学'],
    ['毕业时间', $('grad').value === '2025-06'],
    ['邮箱（仅 placeholder 识别）', $('email').value === 'zhangsan@example.com'],
    ['学历（本科→大学本科 同义词）', $('degree').selectedOptions[0].textContent === '大学本科'],
    ['政治面貌', $('pol').value === 'b'],
    ['性别单选组', doc.querySelector('input[type=radio][value="1"]').checked === true],
    ['自我评价（textarea）', $('eval').value === '基础扎实，动手能力强。'],
    ['紧急联系人电话（不串位）', $('ecphone').value === '13900005678'],
    ['验证码不填', $('cap').value === ''],
    ['复选框不动', $('agree').checked === false],
  ];

  let pass = 0;
  for (const [name, ok] of checks) {
    console.log((ok ? '  ✓' : '  ✗') + ' ' + name);
    if (ok) pass++;
  }
  console.log(`\n${pass}/${checks.length} 通过`);
  const log = doc.getElementById('caf-log');
  console.log('--- 填写日志 ---\n' + (log ? log.textContent : '(空)'));
  process.exit(pass === checks.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
