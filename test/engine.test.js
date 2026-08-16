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
  <div class="row"><label>入学时间</label><input id="entrance"></div>
  <!-- 2b. 分学历字段 -->
  <div class="row"><label>本科院校</label><input id="schoolB"></div>
  <div class="row"><label>硕士院校</label><input id="schoolM"></div>
  <div class="row"><label>硕士研究方向</label><input id="majorM"></div>
  <div class="row"><label>研究生导师</label><input id="advisor"></div>
  <div class="row"><label>所在实验室</label><input id="lab"></div>
  <!-- 2c. 英语成绩项 -->
  <div class="row"><label>四级成绩</label><input id="cet4"></div>
  <div class="row"><label>六级成绩</label><input id="cet6"></div>
  <div class="row"><label>英语水平</label><input id="eng"></div>
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
  <!-- 10. 排在验证码后面的正常字段（回归：弱层不应被上一行的"验证码"污染） -->
  <div class="row"><label>GitHub</label><input id="gh"></div>
  <label><input type="checkbox" id="agree">同意条款</label>
</form>
</body></html>`;

const PROFILE = {
  name: '张三', gender: '男', birthdate: '2002-05-20', phone: '13800001234',
  email: 'zhangsan@example.com', political: '共青团员', ethnicity: '汉族',
  degree: '本科', school_b: '杭州电子科技大学', major_b: '软件工程', grad_b: '2025-06',
  school_m: '浙江大学', major_m: '人工智能', advisor_m: '王教授', lab_m: '智能计算实验室',
  cet4: '560', cet6: '620', english: 'CET-6 620，可流利阅读英文文档',
  self_eval: '基础扎实，动手能力强。', ec_phone: '13900005678', github: 'https://github.com/zhangsan',
  // v1.0 旧键：school 用于验证"新键优先"，entrance_date 用于验证"旧键自动迁移到 entrance_b"
  school: '旧版学校（不应生效）', entrance_date: '2021-09',
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

  // 复制按钮：模拟 execCommand（jsdom 无剪贴板 API，走兜底路径）
  let copied = null;
  doc.execCommand = function () {
    const ta = doc.querySelector('textarea[style*="-9999px"]');
    copied = ta ? ta.value : null;
    return true;
  };
  const nameRow = doc.getElementById('caf-panel').querySelector('[data-key=name]');
  const nameCopyBtn = nameRow.parentElement.querySelector('.caf-copy');
  nameCopyBtn.click();
  await new Promise((r) => setTimeout(r, 80));
  const copyOk = copied === '张三';
  const copyFeedback = nameCopyBtn.textContent === '已复制';
  const emptyCopyBtn = doc.getElementById('caf-panel').querySelector('[data-key=idcard]').parentElement.querySelector('.caf-copy');

  const $ = (id) => doc.getElementById(id);
  const checks = [
    ['姓名（label[for]）', $('userName').value === '张三'],
    ['姓名触发 input 事件（React 兼容）', inputEvents === 1],
    ['手机号码（同级 label）', $('phone').value === '13800001234'],
    ['出生日期（date 归一化）', $('birth').value === '2002-05-20'],
    ['毕业院校（按最高学历路由到本科）', $('school').value === '杭州电子科技大学'],
    ['毕业院校（旧键 school 不生效，新键优先）', $('school').value !== '旧版学校（不应生效）'],
    ['毕业时间（按最高学历路由到本科）', $('grad').value === '2025-06'],
    ['入学时间（v1.0 旧键自动迁移到本科）', $('entrance').value === '2021-09'],
    ['本科院校（显式学历字段）', $('schoolB').value === '杭州电子科技大学'],
    ['硕士院校（显式学历字段）', $('schoolM').value === '浙江大学'],
    ['硕士研究方向', $('majorM').value === '人工智能'],
    ['硕士导师', $('advisor').value === '王教授'],
    ['实验室', $('lab').value === '智能计算实验室'],
    ['四级成绩', $('cet4').value === '560'],
    ['六级成绩', $('cet6').value === '620'],
    ['英语水平（综合兜底）', $('eng').value === 'CET-6 620，可流利阅读英文文档'],
    ['邮箱（仅 placeholder 识别）', $('email').value === 'zhangsan@example.com'],
    ['学历（本科→大学本科 同义词）', $('degree').selectedOptions[0].textContent === '大学本科'],
    ['政治面貌', $('pol').value === 'b'],
    ['性别单选组', doc.querySelector('input[type=radio][value="1"]').checked === true],
    ['自我评价（textarea）', $('eval').value === '基础扎实，动手能力强。'],
    ['紧急联系人电话（不串位）', $('ecphone').value === '13900005678'],
    ['验证码不填', $('cap').value === ''],
    ['验证码后一行正常填（弱层不污染）', $('gh').value === 'https://github.com/zhangsan'],
    ['复选框不动', $('agree').checked === false],
    ['复制按钮：复制字段值', copyOk],
    ['复制按钮：反馈"已复制"', copyFeedback],
    ['复制按钮：空字段不误报', !!emptyCopyBtn],
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
