/**
 * 点填模式专项测试（复制 → 点击网页输入框直接写入）
 * 覆盖：徽标出现/消失、悬停高亮、点击填入、Ctrl 连填、Esc 取消、密码/验证码跳过、下拉框匹配
 * 运行：node test/paste.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'campus-autofill.user.js'), 'utf8');

const HTML = `<!DOCTYPE html><html><body>
<form>
  <!-- 引擎识别不到的生僻字段（点填模式的目标场景） -->
  <div class="row"><label>生辰八字</label><input id="weird1"></div>
  <div class="row"><label>幸运数字</label><input id="weird2"></div>
  <div class="row"><label>密码</label><input id="pw" type="password"></div>
  <div class="row"><label>验证码</label><input id="cap"></div>
  <div class="row"><label>民族</label>
    <select id="nation"><option value="">请选择</option><option value="h">汉族</option><option value="r">回族</option></select>
  </div>
</form>
</body></html>`;

(async () => {
  const dom = new JSDOM(HTML, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((r) => (window.document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
  window.Element.prototype.getBoundingClientRect = function () {
    return { width: 30, height: 20, top: 0, left: 0, right: 30, bottom: 20 };
  };
  window.localStorage.setItem('caf_profile', JSON.stringify({ name: '张三', ethnicity: '汉族' }));
  window.document.execCommand = function () { return true; };

  const doc = window.document;
  window.eval(SRC);
  await new Promise((r) => setTimeout(r, 250));
  const panel = doc.getElementById('caf-panel');
  const hover = (el) => el.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  const click = (el, ctrl) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, ctrlKey: !!ctrl }));
  const esc = () => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const badge = () => doc.getElementById('caf-paste-badge');
  const armField = (key) => panel.querySelector('[data-key=' + key + ']').parentElement.querySelector('.caf-copy').click();

  let pass = 0, total = 0;
  const check = (n, ok) => { total++; if (ok) pass++; console.log((ok ? '  ✓' : '  ✗') + ' ' + n); };
  await (async () => {})();

  // 激活
  armField('name');
  await new Promise((r) => setTimeout(r, 50));
  check('点击复制后出现点填徽标', !!badge() && badge().textContent.includes('张三'));
  const styleText = doc.getElementById('caf-style').textContent;
  check('徽标带红色呼吸灯动画（样式含 caf-breathe）', styleText.includes('caf-breathe') && styleText.includes('animation: caf-breathe'));

  // 悬停高亮
  hover(doc.getElementById('weird1'));
  check('悬停可填输入框高亮', doc.getElementById('weird1').classList.contains('caf-paste-target'));
  hover(doc.getElementById('pw'));
  check('悬停密码框不高亮', !doc.getElementById('pw').classList.contains('caf-paste-target'));

  // 点击填入 + 自动退出
  click(doc.getElementById('weird1'));
  check('点击未识别输入框直接写入', doc.getElementById('weird1').value === '张三');
  check('填一次后徽标自动消失', !badge());

  // Ctrl 连填
  armField('name');
  await new Promise((r) => setTimeout(r, 50));
  click(doc.getElementById('weird2'), true);
  check('Ctrl+点击连续填入', doc.getElementById('weird2').value === '张三');
  check('Ctrl 点击后模式保持', !!badge());
  esc();
  check('Esc 取消模式', !badge());

  // 危险字段跳过
  armField('name');
  await new Promise((r) => setTimeout(r, 50));
  click(doc.getElementById('pw'));
  click(doc.getElementById('cap'));
  check('密码/验证码不写入且模式保持', doc.getElementById('pw').value === '' && doc.getElementById('cap').value === '' && !!badge());
  esc();

  // 下拉框
  armField('ethnicity');
  await new Promise((r) => setTimeout(r, 50));
  click(doc.getElementById('nation'));
  check('点击下拉框按同义词选中', doc.getElementById('nation').value === 'h');

  console.log(`\n${pass}/${total} 通过`);
  process.exit(pass === total ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
