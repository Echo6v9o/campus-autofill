/**
 * 自定义下拉专项测试（模拟 antd/element 式组件）
 * 场景1：只读 input + 民族（选项类，严格匹配）
 * 场景2：role=combobox input + 毕业院校（文本类，宽松匹配，走学历路由）
 * 场景3：div/span 触发器"请选择" + 最高学历（无 input 的组件库下拉）
 * 运行：node test/dropdown.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'campus-autofill.user.js'), 'utf8');

const HTML = `<!DOCTYPE html><html><body>
<form>
  <!-- 场景1：readonly input（element-ui 风格） -->
  <div class="row"><label>民族</label><input id="nation" readonly></div>
  <ul class="el-select-dropdown" id="dd1" data-hidden="1">
    <li data-v="汉族">汉族</li><li data-v="回族">回族</li>
  </ul>
  <!-- 场景2：role=combobox input（antd 风格） -->
  <div class="row"><label>毕业院校</label><input id="cschool" role="combobox" type="text"></div>
  <ul class="ant-select-dropdown" id="dd2" data-hidden="1">
    <li data-v="杭州电子科技大学">杭州电子科技大学</li><li data-v="浙江大学">浙江大学</li>
  </ul>
  <!-- 场景3：div 触发器（无 input） -->
  <div class="row"><label>最高学历</label><span id="dtrig" class="my-select">请选择</span></div>
  <div class="select-dropdown" id="dd3" data-hidden="1">
    <div role="option" data-v="大学本科">大学本科</div>
    <div role="option" data-v="硕士研究生">硕士研究生</div>
  </div>
</form>
</body></html>`;

(async () => {
  const dom = new JSDOM(HTML, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  await new Promise((r) => (window.document.readyState === 'complete' ? r() : window.addEventListener('load', r)));

  // jsdom 无布局：用 data-hidden 属性模拟"隐藏"（弹层关闭时不可见）
  window.Element.prototype.getBoundingClientRect = function () {
    if (this.closest && this.closest('[data-hidden="1"]')) {
      return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
    }
    return { width: 30, height: 20, top: 0, left: 0, right: 30, bottom: 20 };
  };

  window.localStorage.setItem('caf_profile', JSON.stringify({
    degree: '本科', ethnicity: '汉族', school_b: '杭州电子科技大学',
  }));

  const doc = window.document;
  const show = (id) => doc.getElementById(id).removeAttribute('data-hidden');
  const hide = (id) => doc.getElementById(id).setAttribute('data-hidden', '1');

  // 模拟组件库：点触发器展开，点选项写值并收起
  doc.getElementById('nation').addEventListener('click', () => show('dd1'));
  [...doc.querySelectorAll('#dd1 li')].forEach((li) => li.addEventListener('click', () => {
    doc.getElementById('nation').value = li.dataset.v; hide('dd1');
  }));
  doc.getElementById('cschool').addEventListener('click', () => show('dd2'));
  [...doc.querySelectorAll('#dd2 li')].forEach((li) => li.addEventListener('click', () => {
    doc.getElementById('cschool').value = li.dataset.v; hide('dd2');
  }));
  doc.getElementById('dtrig').addEventListener('click', () => show('dd3'));
  [...doc.querySelectorAll('#dd3 [role=option]')].forEach((o) => o.addEventListener('click', () => {
    doc.getElementById('dtrig').textContent = o.dataset.v; hide('dd3');
  }));

  window.eval(SRC);
  await new Promise((r) => setTimeout(r, 300));
  doc.querySelector('[data-act="fill"]').click();

  const done = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const el = doc.getElementById('caf-toast');
      if (el && /填写完成/.test(el.textContent)) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > 12000) { clearInterval(iv); resolve(false); }
    }, 100);
  });
  await new Promise((r) => setTimeout(r, 150));

  const checks = [
    ['流程完成', done],
    ['场景1 只读下拉·民族（严格匹配）', doc.getElementById('nation').value === '汉族'],
    ['场景2 combobox 下拉·毕业院校（宽松+学历路由）', doc.getElementById('cschool').value === '杭州电子科技大学'],
    ['场景3 div 触发器·最高学历（请选择占位）', doc.getElementById('dtrig').textContent === '大学本科'],
  ];
  let pass = 0;
  for (const [n, ok] of checks) { console.log((ok ? '  ✓' : '  ✗') + ' ' + n); if (ok) pass++; }
  console.log(`\n${pass}/${checks.length} 通过`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
