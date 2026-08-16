// ==UserScript==
// @name         校招一键填写助手（本地版）
// @namespace    local.campus.autofill
// @version      1.3.0
// @description  校招网申表单一键填写：简历信息保存在本地，智能识别姓名/性别/学校/实习经历等字段，兼容 React/Vue 受控表单、原生下拉、单选组和 iframe 内嵌表单。数据不上传任何服务器。
// @author       local
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://cdn.jsdelivr.net/gh/Echo6v9o/campus-autofill@main/campus-autofill.user.js
// @updateURL    https://cdn.jsdelivr.net/gh/Echo6v9o/campus-autofill@main/campus-autofill.user.js
// ==/UserScript==

(function () {
  'use strict';

  const IS_TOP = (() => { try { return window.top === window; } catch (e) { return false; } })();
  const ROOT_ID = 'caf-root';

  // ------------------------------------------------------------------
  // 存储（优先油猴 GM 存储，读不到时退回 localStorage）
  // ------------------------------------------------------------------
  const store = {
    get(k, d) {
      try { if (typeof GM_getValue === 'function') return GM_getValue(k, d); } catch (e) {}
      try {
        const v = localStorage.getItem('caf_' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return; } } catch (e) {}
      try { localStorage.setItem('caf_' + k, JSON.stringify(v)); } catch (e) {}
    }
  };

  // ------------------------------------------------------------------
  // 字段配置：编辑面板 + 页面识别共用
  //   kws     匹配关键词（按在上下文中出现的位置取胜，越靠前越优先，同位置取更长的词）
  //   exclude 出现在关键词【之前】时否决匹配（如"紧急联系人电话"不应填进"手机"）
  //   long    长文本，只填 textarea / contenteditable，避免把整段经历塞进"实习公司"这种单行框
  //   choice  选项类字段（单选组 / 自定义下拉兜底）
  //   selectOnly 只接受下拉/单选，不直接填可编辑文本框（如"学历"）
  //   byDegree 通用教育字段路由：按上下文中的"本科/硕士/博士"字样或最高学历路由到 _b/_m/_p
  //   hidden  仅参与页面识别，不在面板中显示
  // ------------------------------------------------------------------
  const SECTIONS = [
    {
      title: '基本信息',
      fields: [
        { key: 'name', label: '姓名', kws: ['姓名', '名字', 'name'], exclude: ['紧急', '联系人', '推荐', '家长', '证明', '导师'] },
        { key: 'gender', label: '性别（男/女）', choice: true, kws: ['性别', 'gender'] },
        { key: 'birthdate', label: '出生日期', kws: ['出生日期', '出生年月', '生日', '出生'], exclude: ['籍贯', '生源地', '出生地', '户口', '户籍'] },
        { key: 'phone', label: '手机号码', kws: ['手机号码', '手机号', '手机', '联系电话', '联系方式', '电话号码', '电话', 'phone', 'mobile', 'tel'], exclude: ['紧急', '联系人', '家长', '家庭', '推荐', '导师', '证明'] },
        { key: 'email', label: '邮箱', kws: ['邮箱', '电子邮件', 'email', 'e-mail', 'mail'] },
        { key: 'idcard', label: '身份证号', kws: ['身份证号码', '身份证号', '身份证', '证件号码'], exclude: ['学生证', '毕业证', '学位证', '资格证'] },
        { key: 'political', label: '政治面貌', choice: true, kws: ['政治面貌', '政治'] },
        { key: 'ethnicity', label: '民族', choice: true, kws: ['民族'] },
        { key: 'native_place', label: '籍贯/户口所在地', kws: ['籍贯', '生源地', '出生地', '户口所在地', '户籍所在地', '户籍', '户口'] },
        { key: 'current_city', label: '现居城市', kws: ['现居住地', '现居城市', '居住城市', '居住地', '所在城市', '常驻城市', '现居', '目前所在'] },
        { key: 'marital', label: '婚姻状况', choice: true, kws: ['婚姻', '婚否', '结婚'] },
      ],
    },
    {
      title: '教育背景 · 通用',
      fields: [
        { key: 'degree', label: '最高学历（本科/硕士/博士）', choice: true, selectOnly: true, kws: ['最高学历', '学历', '学位', '文化程度', 'degree', 'education'], exclude: ['第一', '双学位'] },
        { key: 'cet4', label: '四级(CET-4)成绩', kws: ['大学英语四级成绩', '英语四级成绩', '四级成绩', '四级分数', 'cet4', '英语四级', '大学英语四级', '四级'] },
        { key: 'cet6', label: '六级(CET-6)成绩', kws: ['大学英语六级成绩', '英语六级成绩', '六级成绩', '六级分数', 'cet6', '英语六级', '大学英语六级', '六级'] },
        { key: 'ielts', label: '雅思成绩', kws: ['雅思成绩', '雅思分数', '雅思', 'ielts'] },
        { key: 'toefl', label: '托福成绩', kws: ['托福成绩', '托福分数', '托福', 'toefl'] },
        { key: 'english', label: '英语水平（综合描述，兜底）', kws: ['大学英语', '英语水平', '英语等级', '外语水平', 'cet', '英语'], exclude: ['专业'] },
      ],
    },
    {
      title: '教育背景 · 本科',
      fields: [
        { key: 'school_b', label: '本科学校', kws: ['本科毕业院校', '本科就读院校', '本科院校', '本科学校', '本科大学'] },
        { key: 'college_b', label: '本科学院/院系', kws: ['本科院系', '本科学院', '本科所在学院'] },
        { key: 'major_b', label: '本科专业', kws: ['本科所学专业', '本科专业'] },
        { key: 'gpa_b', label: '本科GPA/均分', kws: ['本科gpa', '本科绩点', '本科均分', '本科平均分', '本科平均成绩', '本科成绩'] },
        { key: 'rank_b', label: '本科排名', kws: ['本科成绩排名', '本科排名', '本科名次'] },
        { key: 'entrance_b', label: '本科入学时间', kws: ['本科入学时间', '本科入学年月', '本科入学年份', '本科入学'] },
        { key: 'grad_b', label: '本科毕业时间', kws: ['本科毕业时间', '本科毕业年月', '本科毕业年份', '本科预计毕业', '本科毕业日期', '本科毕业'] },
      ],
    },
    {
      title: '教育背景 · 硕士',
      fields: [
        { key: 'school_m', label: '硕士学校', kws: ['硕士毕业院校', '研究生毕业院校', '硕士就读院校', '研究生就读院校', '硕士院校', '研究生院校', '硕士学校', '研究生学校', '硕士大学'] },
        { key: 'college_m', label: '硕士学院/院系', kws: ['硕士院系', '硕士学院', '研究生院系', '研究生学院'] },
        { key: 'major_m', label: '硕士专业/研究方向', kws: ['硕士研究生专业', '硕士专业', '研究生专业', '硕士研究方向', '硕士所学专业'] },
        { key: 'gpa_m', label: '硕士GPA/均分', kws: ['硕士gpa', '硕士绩点', '硕士均分', '硕士平均分', '硕士平均成绩', '硕士成绩', '研究生gpa', '研究生成绩'] },
        { key: 'rank_m', label: '硕士排名', kws: ['硕士成绩排名', '硕士排名', '硕士名次', '研究生排名'] },
        { key: 'entrance_m', label: '硕士入学时间', kws: ['硕士入学时间', '硕士入学年月', '硕士入学年份', '硕士入学', '研究生入学'] },
        { key: 'grad_m', label: '硕士毕业时间', kws: ['硕士毕业时间', '硕士毕业年月', '硕士毕业年份', '硕士预计毕业', '硕士毕业日期', '硕士毕业', '研究生毕业时间'] },
      ],
    },
    {
      title: '教育背景 · 博士',
      fields: [
        { key: 'school_p', label: '博士学校', kws: ['博士研究生毕业院校', '博士毕业院校', '博士就读院校', '博士院校', '博士学校', '博士大学', '博士研究生院校'] },
        { key: 'college_p', label: '博士学院/院系', kws: ['博士院系', '博士学院', '博士所在学院'] },
        { key: 'major_p', label: '博士专业/研究方向', kws: ['博士研究生专业', '博士专业', '博士研究方向', '博士所学专业'] },
        { key: 'gpa_p', label: '博士GPA/均分', kws: ['博士gpa', '博士绩点', '博士均分', '博士平均分', '博士平均成绩', '博士成绩'] },
        { key: 'rank_p', label: '博士排名', kws: ['博士成绩排名', '博士排名', '博士名次'] },
        { key: 'entrance_p', label: '博士入学时间', kws: ['博士入学时间', '博士入学年月', '博士入学年份', '博士入学'] },
        { key: 'grad_p', label: '博士毕业时间', kws: ['博士毕业时间', '博士毕业年月', '博士毕业年份', '博士预计毕业', '博士毕业日期', '博士毕业'] },
      ],
    },
    {
      title: '求职意向',
      fields: [
        { key: 'expect_job', label: '期望岗位', kws: ['期望职位', '期望岗位', '意向岗位', '应聘岗位', '应聘职位', '求职意向', '求职岗位', '投递岗位', '期望职务', '岗位', '职位'] },
        { key: 'expect_city', label: '期望城市', kws: ['期望工作城市', '期望城市', '期望工作地点', '期望地点', '期望工作地', '意向城市', '意向地点', '意向工作地', '工作城市', '工作地点'] },
        { key: 'expect_salary', label: '期望薪资', kws: ['期望薪资', '期望薪酬', '期望工资', '薪资', '薪水', '薪酬', '月薪', '年薪', '待遇', '工资'] },
        { key: 'expect_industry', label: '意向行业', kws: ['意向行业', '期望行业', '从事行业', '行业'] },
        { key: 'onboard_time', label: '到岗/入职时间', kws: ['到岗时间', '最快到岗', '到岗', '入职时间', '可入职', '入职', '可开始工作', '开始工作时间', '上岗时间', '到职'] },
      ],
    },
    {
      title: '实习/工作经历（可多条）',
      type: 'entries',
      kind: 'internships',
      addLabel: '➕ 添加一段实习',
      matchRules: [
        { key: 'intern_org', label: '实习公司/单位', entry: 'internships', sub: 'org', kws: ['实习公司名称', '实习单位名称', '实习单位', '实习公司', '任职公司', '公司名称', '单位名称', '公司'], exclude: ['期望', '意向', '行业'] },
        { key: 'intern_role', label: '实习职位', entry: 'internships', sub: 'role', kws: ['实习职位', '实习岗位名称', '实习岗位', '实习职务', '担任职务', '职位名称', '岗位名称', '职务', '职位'] },
        { key: 'intern_period', label: '实习起止时间', entry: 'internships', sub: 'period', kws: ['实习起止时间', '实习时间段', '实习时间', '实习期间', '起止时间'] },
        { key: 'intern_desc', label: '实习工作内容', entry: 'internships', sub: 'desc', long: true, kws: ['实习经历描述', '工作内容', '实习内容', '实习描述', '主要工作', '工作描述', '职责描述', '实习职责', '工作职责'] },
      ],
    },
    {
      title: '项目经历（可多条）',
      type: 'entries',
      kind: 'projects',
      addLabel: '➕ 添加一个项目',
      matchRules: [
        { key: 'project_name', label: '项目名称', entry: 'projects', sub: 'org', kws: ['项目名称', '项目名'] },
        { key: 'project_role', label: '项目角色', entry: 'projects', sub: 'role', kws: ['项目担任角色', '项目角色', '项目职务', '项目中职务', '担任角色'] },
        { key: 'project_period', label: '项目起止时间', entry: 'projects', sub: 'period', kws: ['项目起止时间', '项目时间段', '项目时间', '项目周期'] },
        { key: 'project_desc', label: '项目描述', entry: 'projects', sub: 'desc', long: true, kws: ['项目描述', '项目内容', '项目简介', '项目详情', '项目说明'] },
      ],
    },
    {
      title: '经历与描述（其他长文本）',
      fields: [
        { key: 'campus', label: '校园/学生工作', long: true, kws: ['学生工作', '校园经历', '校园工作', '社团经历', '社团', '校内经历', '任职经历', '社会工作'] },
        { key: 'research', label: '科研/论文', long: true, kws: ['科研经历', '科研成果', '学术论文', '论文', '科研', '学术成果', '学术'] },
        { key: 'awards', label: '获奖情况', long: true, kws: ['获奖情况', '获奖', '奖项', '荣誉', '证书', '奖励'] },
        { key: 'skills', label: '专业技能', long: true, kws: ['专业技能', '技能特长', '技能', '特长', '技术'] },
        { key: 'self_eval', label: '自我评价', long: true, kws: ['自我评价', '自我介绍', '自我描述', '个人评价', '个人介绍', '个人简介', '个人陈述', '自我认知'] },
        { key: 'hobby', label: '兴趣爱好', long: true, kws: ['兴趣爱好', '爱好', '兴趣'] },
      ],
    },
    {
      title: '紧急联系人',
      fields: [
        { key: 'ec_name', label: '紧急联系人姓名', kws: ['紧急联系人姓名', '紧急联系人', '联系人姓名'], exclude: ['电话', '关系'] },
        { key: 'ec_relation', label: '与本人关系', kws: ['与本人关系', '联系人关系', '关系'], exclude: ['紧急联系人姓名', '电话'] },
        { key: 'ec_phone', label: '紧急联系人电话', kws: ['紧急联系人电话', '紧急联系方式', '紧急联系电话', '家庭电话', '家长电话', '联系人电话', '联系人手机'] },
      ],
    },
    {
      title: '其他',
      fields: [
        { key: 'github', label: 'GitHub/个人主页', kws: ['github', '个人主页', '个人网站', 'gitee', '博客'] },
        { key: 'photo_url', label: '证件照链接', kws: ['证件照', '照片链接', '照片', '头像'] },
      ],
    },
  ];

  // 隐藏路由规则：面板不显示，仅供页面识别。表单里出现"本科/硕士(研究生)/博士"字样时
  // 路由到对应学历的数据；没有字样时按"最高学历"默认路由（byDegree）。
  const HIDDEN_RULES = [
    { key: 'school', hidden: true, byDegree: true, label: '学校', kws: ['毕业院校', '就读院校', '院校', '学校', '大学', 'university', 'school'], exclude: ['英语', '四级', '六级', '成绩', '排名'] },
    { key: 'college', hidden: true, byDegree: true, label: '学院/院系', kws: ['院系', '学院', '二级学院'] },
    { key: 'major', hidden: true, byDegree: true, label: '专业', kws: ['所学专业', '专业名称', '专业', '研究方向', 'major'], exclude: ['技能', '特长', '职务'] },
    { key: 'gpa', hidden: true, byDegree: true, label: 'GPA/均分', kws: ['gpa', '绩点', '平均成绩', '平均分', '均分', '成绩'], exclude: ['排名', '名次', '英语', '四级', '六级', '雅思', '托福'] },
    { key: 'rank', hidden: true, byDegree: true, label: '成绩排名', kws: ['成绩排名', '排名', '名次'] },
    { key: 'entrance_date', hidden: true, byDegree: true, label: '入学时间', kws: ['入学时间', '入学年月', '入学年份', '入学'] },
    { key: 'grad_date', hidden: true, byDegree: true, label: '毕业时间', kws: ['毕业时间', '毕业年月', '毕业年份', '预计毕业', '毕业日期', '毕业', '届毕业生'], exclude: ['院校', '学校'] },
    // 整段式经历（老式表单只有一个大文本框）：多条经历按条合并后填入
    { key: 'internship', hidden: true, long: true, blobOf: 'internships', label: '实习经历（多条合并）', kws: ['实习经历', '工作经历', '工作/实习', '实习信息', '实践经历', '社会实践', '实习'] },
    { key: 'project', hidden: true, long: true, blobOf: 'projects', label: '项目经历（多条合并）', kws: ['项目经历', '项目经验', '项目'] },
  ];

  const ALL_FIELDS = [...SECTIONS.flatMap((s) => [...(s.fields || []), ...(s.matchRules || [])]), ...HIDDEN_RULES];
  const FIELD_MAP = Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f]));

  // v1.0 旧版通用教育字段 → v1.1 分学历字段（按最高学历决定落到本科/硕士/博士，旧键保留不删）
  const OLD_KEY_MAP = { school: 'school', college: 'college', major: 'major', gpa: 'gpa', rank: 'rank', entrance_date: 'entrance', grad_date: 'grad' };
  function loadProfile() {
    const p = store.get('profile', {});
    let changed = false;
    const deg = norm(p.degree || '');
    const suf = deg.includes('博士') ? '_p' : (deg.includes('硕士') || deg.includes('研究生')) ? '_m' : '_b';
    for (const [oldK, base] of Object.entries(OLD_KEY_MAP)) {
      const newK = base + suf;
      if ((p[oldK] || '').trim() && !(p[newK] || '').trim()) { p[newK] = p[oldK].trim(); changed = true; }
    }
    // v1.1 及更早的整段实习/项目文本 → v1.2 多条结构（作为第 1 条的描述）
    for (const [oldK, arrK] of [['internship', 'internships'], ['project', 'projects']]) {
      if (typeof p[oldK] === 'string' && p[oldK].trim() &&
        !(Array.isArray(p[arrK]) && p[arrK].some((e) => e && (e.desc || '').trim()))) {
        p[arrK] = [{ org: '', role: '', period: '', desc: p[oldK].trim() }];
        changed = true;
      }
    }
    if (changed) store.set('profile', p);
    return p;
  }

  // ------------------------------------------------------------------
  // 多条经历（实习/项目）
  // ------------------------------------------------------------------
  const ENTRY_SUBS = ['org', 'role', 'period', 'desc'];

  function entryList(profile, kind) {
    const arr = profile[kind];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && ENTRY_SUBS.some((s) => (e[s] || '').trim()));
  }

  function mergedText(list) {
    return list.map((e) => {
      const head = [e.org, e.role, e.period].map((s) => (s || '').trim()).filter(Boolean).join(' ｜ ');
      const desc = (e.desc || '').trim();
      return (head ? head + (desc ? '\n' : '') : '') + desc;
    }).filter(Boolean).join('\n\n');
  }

  // 找表单自己的"添加实习/项目经历"按钮（点击后表单会新增一段空的经历块）
  function findAddBtn(kind) {
    const kw = kind === 'internships' ? ['实习', '工作经历', '经历'] : ['项目'];
    const nodes = [...document.querySelectorAll('button, a, [role="button"], .btn, span')];
    return nodes.find((b) => {
      if (!isVisible(b) || inOwnUI(b)) return false;
      const t = (textOf(b) || '').trim();
      if (!t || t.length > 20) return false;
      if (!/(添加|新增|增加|继续添加|再添加|添加一)/.test(t)) return false;
      return kw.some((k) => t.includes(k));
    });
  }

  // 重新扫描某 kind 的经历子字段控件（用于点击"添加"后找新块）
  function scanEntryControls(kind, profile) {
    const out = { org: [], role: [], period: [], desc: [] };
    const ctrls = [...document.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""]')]
      .filter((el) => !inOwnUI(el) && isVisible(el) && isEditable(el));
    for (const el of ctrls) {
      if ((el.value || '').trim() || (el.isContentEditable && textOf(el).trim())) continue; // 只要空控件
      const rule = matchRuleFor(el, profile);
      if (rule && rule.entry === kind) out[rule.sub].push(el);
    }
    return out;
  }

  // 选项同义词：让"本科"能命中"大学本科/Bachelor"，"男"能命中"M/Male"等
  const SYN = {
    '男': ['男', '男性', 'male', 'm'],
    '女': ['女', '女性', 'female', 'f'],
    '本科': ['本科', '大学本科', '学士', 'bachelor', 'undergraduate', '本科学士'],
    '硕士': ['硕士', '硕士研究生', '研究生', 'master'],
    '博士': ['博士', '博士研究生', 'doctor', 'phd'],
    '中共党员': ['中共党员', '党员', 'cpc', '共产主义'],
    '共青团员': ['共青团员', '团员'],
    '群众': ['群众', '无党派', '普通'],
    '未婚': ['未婚', 'single', 'unmarried', '单身'],
    '已婚': ['已婚', 'married'],
    '汉族': ['汉族', 'han'],
  };

  // ------------------------------------------------------------------
  // 工具函数
  // ------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s:：*＊()（）【】\[\]、,，。.·\-_/\\]/g, '');

  function isEditable(el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === '')) return true;
    return false;
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    if (el.type === 'hidden' || el.disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function inOwnUI(el) {
    return !!(el.closest && el.closest('#' + ROOT_ID));
  }

  function textOf(el) {
    try { const t = el.innerText; if (t != null) return t; } catch (e) {}
    return el.textContent || '';
  }

  // 取控件的上下文文本，按可信度分两层：
  //   strong：控件自身的标签信号（label[for]、同级/包裹 label、placeholder、aria-label）
  //   weak  ：外部信号（各级祖先的前置兄弟文本、name/id 属性），只在 strong 匹配不到时兜底
  function ctxOf(el) {
    const strong = [], weak = [];
    try {
      if (el.id) {
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : String(el.id).replace(/(["\\])/g, '\\$1');
        const l = document.querySelector('label[for="' + esc + '"]');
        if (l) strong.push(l.textContent);
      }
    } catch (e) {}
    // 输入框自己的前置兄弟（<label>姓名</label><input> 这种最常见结构）
    let own = el.previousElementSibling, tries = 0;
    while (own && tries < 2) {
      const t = textOf(own).trim();
      if (t) { if (t.length <= 60) strong.push(t); break; }
      own = own.previousElementSibling; tries++;
    }
    // 各级祖先的"前置兄弟"文本（内层优先），属于外部信号
    let node = el.parentElement, hops = 0;
    while (node && hops < 6 && node !== document.body) {
      let prev = node.previousElementSibling, got = '';
      let t2 = 0;
      while (prev && t2 < 2) {
        const t = textOf(prev).trim();
        if (t) { got = t; break; }
        prev = prev.previousElementSibling; t2++;
      }
      if (got && got.length <= 120) weak.push(got);
      const selfT = textOf(node).trim();
      if (selfT.length > 200) break;
      node = node.parentElement; hops++;
    }
    if (el.closest && el.closest('label')) {
      const lt = el.closest('label').textContent;
      if (lt && lt.length <= 30) strong.push(lt);
    }
    if (el.placeholder) strong.push(el.placeholder);
    if (el.getAttribute) {
      const aria = el.getAttribute('aria-label');
      if (aria) strong.push(aria);
    }
    if (el.name) weak.push(el.name);
    if (el.id && typeof el.id === 'string') weak.push(el.id);
    return { strong: strong.join(' '), weak: weak.join(' ') };
  }

  // 路由器键名 → 分学历字段基础名（school/gpa 等同名，grad_date→grad、entrance_date→entrance 需转换）
  const DEGREE_BASE = { school: 'school', college: 'college', major: 'major', gpa: 'gpa', rank: 'rank', entrance_date: 'entrance', grad_date: 'grad' };

  // 从上下文判断学历阶段：取最早出现的"本科/硕士(研究生)/博士"字样；
  // 都没有时按用户填写的最高学历默认路由（本科兜底）
  function degreeVariantOf(c, profile) {
    const ctx = norm(c.strong + ' ' + c.weak);
    const marks = [['_p', '博士'], ['_m', '硕士'], ['_m', '研究生'], ['_b', '本科']];
    let best = '', bestPos = Infinity;
    for (const [suf, kw] of marks) {
      const p = ctx.indexOf(kw);
      if (p >= 0 && p < bestPos) { bestPos = p; best = suf; }
    }
    if (best) return best;
    const d = norm((profile && profile.degree) || '');
    if (d.includes('博士')) return '_p';
    if (d.includes('硕士') || d.includes('研究生')) return '_m';
    return '_b';
  }

  function matchRuleFor(el, profile) {
    const c = ctxOf(el);
    // 黑名单（验证码等）对两层上下文全局生效，防止弱层文本绕过
    const all = (c.strong + ' ' + c.weak).toLowerCase();
    if (all.includes('验证码') || all.includes('captcha') || all.includes('verify')) return null;
    const rule = matchRule(c.strong) || matchRule(c.weak);
    if (rule && rule.byDegree) {
      const variant = FIELD_MAP[(DEGREE_BASE[rule.key] || rule.key) + degreeVariantOf(c, profile)];
      if (variant) return variant;
    }
    return rule;
  }

  // 根据上下文匹配字段：关键词出现位置越靠前越优先；同位置取更长关键词；exclude 出现在关键词之前则否决
  function matchRule(ctxRaw) {
    const ctx = norm(ctxRaw);
    if (!ctx) return null;
    if (ctx.includes('验证码') || ctx.includes('captcha') || ctx.includes('verify')) return null;
    let best = null; // {rule, pos, kwLen}
    for (const rule of ALL_FIELDS) {
      let pos = -1, kwLen = 0;
      for (const kw of rule.kws) {
        const nk = norm(kw);
        if (!nk) continue;
        const p = ctx.indexOf(nk);
        if (p >= 0 && (pos < 0 || p < pos || (p === pos && nk.length > kwLen))) {
          pos = p; kwLen = nk.length;
        }
      }
      if (pos < 0) continue;
      let veto = false;
      for (const ex of rule.exclude || []) {
        const ep = ctx.indexOf(norm(ex));
        if (ep >= 0 && ep < pos + kwLen) { veto = true; break; } // exclude 出现在关键词前面（同标签内）
      }
      if (veto) continue;
      if (!best || pos < best.pos || (pos === best.pos && kwLen > best.kwLen)) best = { rule, pos, kwLen };
    }
    return best ? best.rule : null;
  }

  // 让 React/Vue 受控输入真正接收到值：原生 value setter + input/change 事件
  function setValue(el, value) {
    try {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    } catch (e) { el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function dateLike(value, type) {
    const nums = (String(value).match(/\d+/g) || []).map((s) => parseInt(s, 10));
    const p = (n) => (n == null ? '01' : String(n).padStart(2, '0'));
    if (!nums.length) return value;
    if (type === 'date' || type === 'datetime-local') {
      return nums[0] + '-' + p(nums[1]) + '-' + p(nums[2] || 1);
    }
    if (type === 'month') return nums[0] + '-' + p(nums[1] || 9);
    return value;
  }

  function synsOf(value) {
    const v = norm(value);
    const list = [v];
    for (const k in SYN) if (norm(k) === v) list.push(...SYN[k].map(norm));
    // 值本身可能就是"党员"这种简称
    for (const k in SYN) if (SYN[k].map(norm).includes(v)) list.push(norm(k), ...SYN[k].map(norm));
    return [...new Set(list.filter(Boolean))];
  }

  function textMatchesOption(optionText, value) {
    const ot = norm(optionText);
    if (!ot) return false;
    const cands = synsOf(value);
    for (const c of cands) {
      if (ot === c) return true;
      if (ot.includes(c) && ot.length <= c.length + 8) return true; // "中共党员" 含 "党员"
      if (c.includes(ot) && c.length <= ot.length + 8 && ot.length >= 1) return true; // 选项"M" 对应 "男"
    }
    return false;
  }

  function findOption(select, value) {
    const opts = [...select.options];
    if (!opts.length) return null;
    for (const o of opts) if (norm(o.value) === norm(value) || norm(o.text) === norm(value)) return o;
    for (const o of opts) if (textMatchesOption(o.text, value) || textMatchesOption(o.value, value)) return o;
    // 纯数字选项（如薪资按万元）不做模糊匹配，避免乱填
    return null;
  }

  // 下拉选项匹配：选项类字段走严格同义词匹配；学校/城市/时间等文本值放宽为包含匹配
  function optionMatches(text, value, strict) {
    const ot = norm(text);
    const v = norm(value);
    if (!ot || !v) return false;
    if (ot === v) return true;
    if (!strict) {
      if (ot.includes(v) || v.includes(ot)) return true;
      const oy = ot.replace(/年$/, '');
      if (/^\d{4}$/.test(oy) && v.includes(oy)) return true; // "2025年" 选项 对应 "2025-06"
    }
    return textMatchesOption(text, value);
  }

  function mouseClick(el) {
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    } catch (e) {}
    try { el.click(); } catch (e) {}
  }

  function pressEsc(el) {
    const ev = { key: 'Escape', keyCode: 27, which: 27, bubbles: true };
    try { el.dispatchEvent(new KeyboardEvent('keydown', ev)); } catch (e) {}
    try { document.dispatchEvent(new KeyboardEvent('keydown', ev)); } catch (e) {}
  }

  // 自定义下拉（antd/element 等组件库）：点开触发器，在弹层里找匹配项点击
  const LIB_OPT_SELS = '.ant-select-item-option, .el-select-dropdown__item, .next-select-menu-item, .rc-select-item-option, .semi-select-option, .t-select-option, .arco-select-option, .n-base-select-option, [role="option"]';
  const POPUP_GATE = '[class*="dropdown"], [class*="popup"], [class*="popover"], [class*="overlay"], [role="listbox"], [class*="select"]';
  async function tryCustomDropdown(el, value, o) {
    const strict = !!(o && o.strict);
    try {
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      try { el.focus(); } catch (e) {}
      mouseClick(el);
      let hit = null;
      for (let t = 0; t < 3 && !hit; t++) {
        await sleep(t ? 350 : 300);
        const nodes = [...document.querySelectorAll('li, ' + LIB_OPT_SELS + ', [class*="option"]')].filter((n) => {
          if (inOwnUI(n) || !isVisible(n)) return false;
          const txt = textOf(n).trim();
          if (!txt || txt.length > 30) return false; // 选项文字应较短，避免误点正文
          // 通用选择器（li/[class*=option]）必须位于弹层容器内，防止误点页面普通列表
          try { if (n.matches(LIB_OPT_SELS)) return true; } catch (e) {}
          return !!(n.closest && n.closest(POPUP_GATE));
        });
        hit = nodes.find((n) => optionMatches(textOf(n).trim(), value, strict));
      }
      if (hit) {
        mouseClick(hit);
        await sleep(120);
        pressEsc(el);
        return true;
      }
      pressEsc(el);
      try { document.body.click(); } catch (e) {}
      return false;
    } catch (e) { return false; }
  }

  function mark(el, ok) {
    if (!el.classList) return;
    el.classList.remove('caf-ok', 'caf-preview', 'caf-fail');
    void el.offsetWidth;
    el.classList.add(ok === true ? 'caf-ok' : ok === 'preview' ? 'caf-preview' : 'caf-fail');
  }

  // ------------------------------------------------------------------
  // 单选组（性别/政治面貌等 radio）
  // ------------------------------------------------------------------
  function radioGroups() {
    const radios = [...document.querySelectorAll('input[type="radio"]')].filter((r) => isVisible(r) && !inOwnUI(r));
    const groups = new Map();
    for (const r of radios) {
      let g = r.closest('[role="radiogroup"], fieldset') || r.parentElement;
      // 向上找到一个包含多个 radio 的最近容器作为分组
      let p = r.parentElement;
      while (p && p !== document.body) {
        const rs = p.querySelectorAll('input[type="radio"]');
        if (rs.length > 1) { g = p; break; }
        p = p.parentElement;
      }
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    return [...groups.entries()].filter(([, rs]) => rs.length >= 2 && rs.length <= 12);
  }

  function optionTextOf(radio) {
    const lab = radio.closest('label');
    if (lab) {
      const t = textOf(lab).trim();
      if (t && t.length <= 12) return t;
    }
    let p = radio.parentElement;
    for (let i = 0; i < 2 && p; i++) {
      const t = textOf(p).trim();
      if (t && t.length <= 12) return t;
      p = p.parentElement;
    }
    return '';
  }

  // 多条经历填写：第 i 条数据对位第 i 个经历块；表单槽位不够时点表单自己的"添加"按钮
  async function fillEntries(profile, opts, buckets, push) {
    const filled = new Set();
    const labelKey = (kind, sub) => (kind === 'internships' ? 'intern_' + sub : 'project_' + (sub === 'org' ? 'name' : sub));
    for (const kind of ['internships', 'projects']) {
      const list = entryList(profile, kind);
      if (!list.length) continue;
      const fillIdxInto = (map, idx, offset = 0) => {
        const e = list[idx];
        let any = false;
        for (const sub of ENTRY_SUBS) {
          const el = map[sub] && map[sub][idx - offset];
          const val = (e[sub] || '').trim();
          if (!el || !val || filled.has(el)) continue;
          if (opts.skipFilled && (el.value || '').trim()) continue;
          filled.add(el);
          if (opts.preview) { mark(el, 'preview'); push(labelKey(kind, sub), true, '(预览)'); }
          else {
            setValue(el, val);
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            mark(el, true);
            push(labelKey(kind, sub), true, val);
          }
          any = true;
        }
        return any;
      };
      // 先填已存在的经历块（各子字段按 DOM 顺序与第 i 条对位）
      const slots = Math.max(0, ...ENTRY_SUBS.map((s) => (buckets[kind][s] || []).length));
      let idx = 0;
      for (; idx < Math.min(list.length, slots); idx++) fillIdxInto(buckets[kind], idx);
      // 槽位不够：尝试点击表单的"添加"按钮扩展（防止死循环：没出现新块就停）
      for (; idx < list.length; idx++) {
        if (opts.preview) break;
        const btn = findAddBtn(kind);
        if (!btn) break;
        btn.click();
        await sleep(400);
        const fresh = scanEntryControls(kind, profile);
        const freshCount = Math.max(0, ...ENTRY_SUBS.map((s) => (fresh[s] || []).length));
        if (!freshCount) break;
        if (!fillIdxInto(fresh, idx, idx)) break;
      }
    }
  }

  // ------------------------------------------------------------------
  // 核心：在当前 document 填写
  // ------------------------------------------------------------------
  async function fillDoc(profile, opts) {
    const results = [];
    const push = (key, ok, note) => results.push({ key, ok: !!ok, note: note || '' });
    const buckets = { internships: {}, projects: {} };
    const deferredBlobs = [];

    // 1) 单选组
    for (const [container, radios] of radioGroups()) {
      const ctx = textOf(container).slice(0, 100);
      const rule = matchRule(ctx);
      if (!rule || !rule.choice) continue;
      const val = (profile[rule.key] || '').trim();
      if (!val) continue;
      if (opts.preview) { mark(container, 'preview'); push(rule.key, true, '(预览)单选组'); continue; }
      const hit = radios.find((r) => textMatchesOption(optionTextOf(r), val));
      if (hit) { hit.click(); mark(container, true); push(rule.key, true, val); }
    }

    // 2) 普通控件
    const ctrls = [...document.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""]')]
      .filter((el) => !inOwnUI(el) && isVisible(el) && isEditable(el));

    let firstFilled = null;
    for (const el of ctrls) {
      const tag = el.tagName;
      const type = (el.type || '').toLowerCase();

      if (tag === 'INPUT' && ['password', 'file', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'search'].includes(type)) continue;

      const rule = matchRuleFor(el, profile);
      if (!rule) continue;

      // 经历子字段：进桶稍后逐条对位填写（见 fillEntries）
      if (rule.entry) {
        if (rule.long && tag !== 'TEXTAREA' && !el.isContentEditable) continue;
        (buckets[rule.entry][rule.sub] = buckets[rule.entry][rule.sub] || []).push(el);
        continue;
      }

      // 整段式经历文本框：先记账，页面没有结构化经历子字段时再合并多条填入
      if (rule.blobOf && tag === 'TEXTAREA') { deferredBlobs.push({ el, kind: rule.blobOf }); continue; }

      const val = (profile[rule.key] || '').trim();
      if (!val) continue;

      // 选项类字段（如"学历"）不直接写可编辑文本框，避免把"本科"填进"最高学历毕业院校"这类输入框
      if (rule.selectOnly && tag === 'INPUT' && !el.readOnly) continue;

      // 长文本规则不进单行 input（防止"实习公司"被塞整段经历）
      if (rule.long && tag !== 'TEXTAREA' && !el.isContentEditable) continue;
      if (!rule.long && tag === 'TEXTAREA') {
        // 普通字段一般不占 textarea，但"自我评价"这类例外已按 long 配置，跳过普通规则的 textarea
        continue;
      }

      if (opts.skipFilled) {
        const cur = (el.value != null && el.value !== '' ? el.value : textOf(el)) || '';
        if (cur.trim()) continue;
      }

      if (opts.preview) { mark(el, 'preview'); push(rule.key, true, '(预览)'); continue; }

      let ok = false;
      try {
        if (tag === 'SELECT') {
          const opt = findOption(el, val);
          if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); ok = true; }
        } else if (el.isContentEditable) {
          el.focus();
          el.innerText = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          ok = true;
        } else if (type === 'date' || type === 'month' || type === 'datetime-local') {
          setValue(el, dateLike(val, type));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          ok = el.value !== '';
        } else if (tag === 'INPUT' && (el.readOnly || el.getAttribute('role') === 'combobox')) {
          // 只读输入框或组件库下拉（antd 的搜索框带 role=combobox）走自定义下拉流程
          ok = await tryCustomDropdown(el, val, { strict: !!rule.choice });
        } else {
          setValue(el, val);
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          ok = true;
        }
      } catch (e) { ok = false; }

      mark(el, ok);
      if (ok && !firstFilled) firstFilled = el;
      push(rule.key, ok, ok ? val : '写入失败');
    }

    // 3) 多条经历：逐条对位填写；槽位不足时尝试点击表单的"添加"按钮
    await fillEntries(profile, opts, buckets, push);

    // 4) 整段式经历：页面没有结构化经历子字段时，把多条合并成一段填入
    for (const { el, kind } of deferredBlobs) {
      if (Object.values(buckets[kind]).some((a) => a && a.length)) continue;
      const list = entryList(profile, kind);
      if (!list.length) continue;
      const key = kind === 'internships' ? 'internship' : 'project';
      if (opts.preview) { mark(el, 'preview'); push(key, true, '(预览)多条合并'); continue; }
      setValue(el, mergedText(list));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      mark(el, true);
      push(key, true, list.length + ' 条合并填入');
    }

    // 5) 自定义下拉兜底：识别到字段但前面没填上的（div/span 触发器、非选项类字段的下拉）
    if (!opts.preview) {
      const triggers = [...document.querySelectorAll('[role="combobox"], [role="listbox"]')]
        .filter((el) => isVisible(el) && !inOwnUI(el));
      // div/span 型触发器：显示"请选择"这类占位文字、没有 input 的下拉
      const divTrigs = [...document.querySelectorAll('div, span')].filter((el) => {
        if (triggers.includes(el) || !isVisible(el) || inOwnUI(el)) return false;
        if (el.children.length > 1) return false;
        const t = textOf(el).trim();
        return !!t && t.length <= 12 && /^(请选择|请挑选|请选取|点击选择|—+\s*请选择\s*—+)/.test(t);
      });
      for (const el of [...triggers, ...divTrigs]) {
        if (el.tagName === 'INPUT' && el.type !== 'text') continue;
        if ((el.value || textOf(el) || '').trim() && !/^(请选择|请挑选|请选取|点击选择)/.test(textOf(el).trim())) continue;
        const rule = matchRuleFor(el, profile);
        if (!rule || rule.long || rule.entry || rule.blobOf) continue;
        const val = (profile[rule.key] || '').trim();
        if (!val) continue;
        const ok = await tryCustomDropdown(el, val, { strict: !!rule.choice });
        if (ok) { mark(el, true); push(rule.key, true, val); }
      }
    }

    if (firstFilled) { try { firstFilled.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
    return results;
  }

  // ------------------------------------------------------------------
  // 跨 iframe 协作：顶层发起填写，向所有子 frame 广播，结果回传汇总
  // ------------------------------------------------------------------
  async function handleFillRequest(profile, opts) {
    let results = await fillDoc(profile, opts);
    const iframes = document.querySelectorAll('iframe');
    if (!iframes.length) return results;
    let pending = 0;
    const t0 = Date.now();
    const collect = (e) => {
      if (e.data && e.data.type === 'caf:result') { results = results.concat(e.data.res || []); pending--; }
    };
    window.addEventListener('message', collect);
    for (const f of iframes) {
      try { f.contentWindow.postMessage({ type: 'caf:fill', profile, opts }, '*'); pending++; } catch (e) {}
    }
    while (pending > 0 && Date.now() - t0 < 3500) await sleep(150);
    window.removeEventListener('message', collect);
    return results;
  }

  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'caf:fill') return;
    Promise.resolve(handleFillRequest(e.data.profile || {}, e.data.opts || {})).then((res) => {
      try { e.source.postMessage({ type: 'caf:result', res }, '*'); } catch (err) {}
    });
  });

  // ------------------------------------------------------------------
  // UI（仅顶层窗口显示悬浮球与面板）
  // ------------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById('caf-style')) return;
    const css = `
#caf-root { all: initial; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
#caf-ball { position: fixed; z-index: 2147483600; width: 44px; height: 44px; border-radius: 50%;
  background: linear-gradient(135deg, #4f7cff, #6a5cff); color: #fff; font-size: 20px; line-height: 44px;
  text-align: center; cursor: pointer; box-shadow: 0 4px 14px rgba(80,110,255,.45); user-select: none;
  opacity: .55; transition: opacity .2s; }
#caf-ball:hover { opacity: 1; }
#caf-panel { position: fixed; z-index: 2147483601; top: 40px; right: 24px; width: 400px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 80px); overflow: auto; background: #fff; border-radius: 14px; color: #222;
  box-shadow: 0 12px 40px rgba(0,0,0,.18); font-size: 13px; }
#caf-panel header { position: sticky; top: 0; background: linear-gradient(135deg, #4f7cff, #6a5cff);
  color: #fff; padding: 12px 16px; font-size: 15px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
#caf-panel header button { all: unset; cursor: pointer; color: #fff; font-size: 16px; padding: 0 4px; }
#caf-panel .caf-body { padding: 10px 16px 16px; }
#caf-panel details { border-bottom: 1px solid #f0f0f0; padding: 6px 0; }
#caf-panel summary { cursor: pointer; font-weight: 600; padding: 4px 0; color: #333; }
#caf-panel .caf-row { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; }
#caf-panel .caf-row > label { flex: 0 0 118px; line-height: 30px; color: #555; }
#caf-panel .caf-row > input, #caf-panel .caf-row > textarea { flex: 1; box-sizing: border-box; min-width: 0;
  border: 1px solid #ddd; border-radius: 8px; padding: 6px 9px; font-size: 13px; font-family: inherit; outline: none; }
#caf-panel .caf-row > input:focus, #caf-panel .caf-row > textarea:focus { border-color: #4f7cff; }
#caf-panel textarea { min-height: 72px; resize: vertical; }
#caf-panel .caf-entry { border: 1px solid #e8ebf3; border-radius: 10px; padding: 6px 10px 8px; margin: 8px 0; background: #fbfcff; }
#caf-panel .caf-entry-head { display: flex; justify-content: space-between; align-items: center; color: #8a92a6; font-size: 12px; padding: 2px 0 4px; }
#caf-panel .caf-entry-head button { all: unset; cursor: pointer; color: #e5484d; font-size: 12px; padding: 0 4px; }
#caf-panel .caf-add { all: unset; cursor: pointer; display: block; text-align: center; border: 1px dashed #c8cede; border-radius: 8px; padding: 7px; color: #4f7cff; margin: 6px 0 2px; width: 100%; box-sizing: border-box; }
#caf-panel .caf-add:hover { background: #f2f6ff; }
#caf-panel .caf-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
#caf-panel .caf-actions button { all: unset; cursor: pointer; border-radius: 8px; padding: 7px 12px; font-size: 13px;
  background: #f2f4fa; color: #333; border: 1px solid #e3e6f0; }
#caf-panel .caf-actions button:hover { background: #e8ecfa; }
#caf-panel .caf-actions button.primary { background: linear-gradient(135deg, #4f7cff, #6a5cff); color: #fff; border: none; font-weight: 600; }
#caf-panel .caf-opts { margin-top: 10px; color: #666; display: flex; gap: 14px; flex-wrap: wrap; }
#caf-panel .caf-opts label { cursor: pointer; }
#caf-panel .caf-log { margin-top: 10px; background: #f8f9fc; border-radius: 8px; padding: 8px 10px;
  max-height: 160px; overflow: auto; font-size: 12px; color: #555; line-height: 1.7; display: none; }
.caf-ok { outline: 2px solid #22c55e !important; outline-offset: 1px; transition: outline-color .8s; }
.caf-preview { outline: 2px solid #3b82f6 !important; outline-offset: 1px; }
.caf-fail { outline: 2px dashed #f59e0b !important; outline-offset: 1px; }
#caf-toast { position: fixed; z-index: 2147483602; top: 18px; left: 50%; transform: translateX(-50%);
  background: rgba(20,24,38,.92); color: #fff; padding: 9px 18px; border-radius: 10px; font-size: 13px;
  font-family: "Microsoft YaHei", sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.25); max-width: 80vw; }
`;
    const st = document.createElement('style');
    st.id = 'caf-style';
    st.textContent = css;
    document.documentElement.appendChild(st);
  }

  function toast(msg, ms) {
    const old = document.getElementById('caf-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'caf-toast';
    t.textContent = msg;
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), ms || 2600);
  }

  function buildUI() {
    injectStyle();
    const root = document.createElement('div');
    root.id = ROOT_ID;

    // 悬浮球
    const ball = document.createElement('div');
    ball.id = 'caf-ball';
    ball.title = '校招一键填写（Alt+E 打开面板，Alt+F 直接填写）';
    ball.textContent = '📝';
    const pos = store.get('ballPos', null);
    if (pos) { ball.style.left = pos.left; ball.style.top = pos.top; ball.style.right = 'auto'; }
    else { ball.style.right = '14px'; ball.style.top = '26%'; }

    let dragMoved = false;
    ball.addEventListener('mousedown', (e) => {
      dragMoved = false;
      const sx = e.clientX, sy = e.clientY;
      const r = ball.getBoundingClientRect();
      const move = (ev) => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 5) dragMoved = true;
        if (dragMoved) {
          ball.style.left = Math.max(0, Math.min(innerWidth - 44, ev.clientX - 22)) + 'px';
          ball.style.top = Math.max(0, Math.min(innerHeight - 44, ev.clientY - 22)) + 'px';
          ball.style.right = 'auto';
        }
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (dragMoved) store.set('ballPos', { left: ball.style.left, top: ball.style.top });
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    ball.addEventListener('click', () => { if (!dragMoved) togglePanel(); });
    root.appendChild(ball);

    document.documentElement.appendChild(root);

    // 油猴菜单
    try {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚡ 一键填写', () => runFill());
        GM_registerMenuCommand('✏️ 编辑资料面板', () => togglePanel(true));
        GM_registerMenuCommand('📤 导出资料 JSON', () => exportProfile());
      }
    } catch (e) {}

    // 页面像"有表单"时才显示悬浮球，避免在所有网页打扰
    const looksLikeForm = () =>
      [...document.querySelectorAll('input, select, textarea')].filter((el) => isVisible(el) && !inOwnUI(el)).length >= 3;
    const refreshBall = () => {
      const hide = store.get('ballHidden', false);
      ball.style.display = hide || !looksLikeForm() ? 'none' : 'block';
    };
    let mo = null;
    const observe = () => {
      if (mo) return;
      mo = new MutationObserver(() => {
        clearTimeout(observe._t);
        observe._t = setTimeout(refreshBall, 800);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) { refreshBall(); observe(); }
    else setTimeout(() => { refreshBall(); observe(); }, 500);
    setInterval(refreshBall, 3000);
    buildPanel();
  }

  function fieldInput(f) {
    if (f.long) return `<textarea data-key="${f.key}" placeholder="${f.label}"></textarea>`;
    return `<input data-key="${f.key}" placeholder="${f.label}">`;
  }

  function buildPanel() {
    if (document.getElementById('caf-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'caf-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <header><span>📝 校招一键填写</span><button data-act="close">✕</button></header>
      <div class="caf-body">
        ${SECTIONS.map((s) => `
          <details ${s.title === '基本信息' ? 'open' : ''}>
            <summary>${s.title}</summary>
            ${s.type === 'entries'
              ? `<div class="caf-entries" data-kind="${s.kind}"></div><button class="caf-add" data-add="${s.kind}">${s.addLabel}</button>`
              : s.fields.map((f) => `<div class="caf-row"><label>${f.label}</label>${fieldInput(f)}</div>`).join('')}
          </details>`).join('')}
        <div class="caf-opts">
          <label><input type="checkbox" data-opt="preview"> 预览模式（只高亮不写入）</label>
          <label><input type="checkbox" data-opt="skipFilled"> 不覆盖已填内容</label>
          <label><input type="checkbox" data-opt="ballHidden"> 隐藏悬浮球</label>
        </div>
        <div class="caf-actions">
          <button class="primary" data-act="fill">⚡ 一键填写</button>
          <button data-act="save">💾 保存资料</button>
          <button data-act="export">📤 导出</button>
          <button data-act="import">📥 导入</button>
          <input type="file" id="caf-import-file" accept=".json" style="display:none">
        </div>
        <div class="caf-log" id="caf-log"></div>
      </div>`;
    document.getElementById(ROOT_ID).appendChild(panel);

    // 载入已存资料与选项
    const profile = loadProfile();
    panel.querySelectorAll('[data-key]').forEach((el) => { el.value = profile[el.dataset.key] || ''; });
    panel.querySelectorAll('.caf-entries').forEach((box) => renderEntries(box, profile[box.dataset.kind] || []));
    panel.querySelectorAll('[data-opt]').forEach((el) => {
      el.checked = !!store.get(el.dataset.opt, false);
      el.addEventListener('change', () => {
        store.set(el.dataset.opt, el.checked);
        if (el.dataset.opt === 'ballHidden') document.getElementById('caf-ball').style.display = el.checked ? 'none' : 'block';
      });
    });

    panel.addEventListener('click', async (e) => {
      const addBtn = e.target.closest && e.target.closest('[data-add]');
      if (addBtn) {
        const kind = addBtn.dataset.add;
        const list = collectEntries(kind);
        list.push({ org: '', role: '', period: '', desc: '' });
        renderEntries(entriesBox(kind), list);
        return;
      }
      const delBtn = e.target.closest && e.target.closest('.caf-entry-del');
      if (delBtn) {
        const kind = delBtn.dataset.kind;
        const list = collectEntries(kind);
        list.splice(parseInt(delBtn.dataset.idx, 10), 1);
        renderEntries(entriesBox(kind), list);
        return;
      }
      const act = e.target && e.target.dataset && e.target.dataset.act;
      if (act === 'close') togglePanel(false);
      if (act === 'save') { saveProfile(); toast('✅ 资料已保存到本地'); }
      if (act === 'fill') runFill();
      if (act === 'export') exportProfile();
      if (act === 'import') document.getElementById('caf-import-file').click();
    });
    panel.querySelector('#caf-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(fr.result);
          if (typeof data !== 'object') throw 0;
          store.set('profile', data);
          panel.querySelectorAll('[data-key]').forEach((el) => { el.value = data[el.dataset.key] || ''; });
          toast('✅ 导入成功');
        } catch (err) { toast('❌ 导入失败：不是合法的 JSON 文件'); }
      };
      fr.readAsText(file, 'utf-8');
      e.target.value = '';
    });
  }

  function togglePanel(forceOpen) {
    const p = document.getElementById('caf-panel');
    if (!p) return;
    const show = forceOpen === true ? true : forceOpen === false ? false : p.style.display === 'none';
    p.style.display = show ? 'block' : 'none';
  }

  function saveProfile() {
    const panel = document.getElementById('caf-panel');
    const profile = loadProfile();
    panel.querySelectorAll('[data-key]').forEach((el) => { profile[el.dataset.key] = el.value.trim(); });
    for (const kind of ['internships', 'projects']) {
      profile[kind] = collectEntries(kind)
        .map((e) => ({ org: e.org.trim(), role: e.role.trim(), period: e.period.trim(), desc: e.desc.trim() }))
        .filter((e) => ENTRY_SUBS.some((s) => e[s]));
    }
    store.set('profile', profile);
    return profile;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const ENTRY_FIELD_LABELS = {
    internships: ['公司/单位', '职位', '起止时间', '描述'],
    projects: ['项目名称', '角色/职责', '起止时间', '描述'],
  };

  function entriesBox(kind) {
    return document.querySelector('.caf-entries[data-kind="' + kind + '"]');
  }

  function renderEntries(box, list) {
    if (!box) return;
    const kind = box.dataset.kind;
    const labels = ENTRY_FIELD_LABELS[kind] || ENTRY_FIELD_LABELS.internships;
    if (!list || !list.length) {
      box.innerHTML = '<div style="color:#999;font-size:12px;padding:4px 0;">暂无，点击下方按钮添加</div>';
      return;
    }
    box.innerHTML = list.map((e, i) => `
      <div class="caf-entry">
        <div class="caf-entry-head"><span>第 ${i + 1} 条</span><button class="caf-entry-del" data-kind="${kind}" data-idx="${i}">✕ 删除</button></div>
        <div class="caf-row"><label>${labels[0]}</label><input data-esub="org" value="${esc(e.org)}"></div>
        <div class="caf-row"><label>${labels[1]}</label><input data-esub="role" value="${esc(e.role)}"></div>
        <div class="caf-row"><label>${labels[2]}</label><input data-esub="period" value="${esc(e.period)}"></div>
        <div class="caf-row"><label>${labels[3]}</label><textarea data-esub="desc">${esc(e.desc)}</textarea></div>
      </div>`).join('');
  }

  function collectEntries(kind) {
    const box = entriesBox(kind);
    if (!box) return [];
    return [...box.querySelectorAll('.caf-entry')].map((entry) => ({
      org: (entry.querySelector('[data-esub=org]') || {}).value || '',
      role: (entry.querySelector('[data-esub=role]') || {}).value || '',
      period: (entry.querySelector('[data-esub=period]') || {}).value || '',
      desc: (entry.querySelector('[data-esub=desc]') || {}).value || '',
    }));
  }

  function exportProfile() {
    const data = saveProfile();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'campus-profile-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function logResults(results) {
    const box = document.getElementById('caf-log');
    if (!box) return;
    if (!results.length) { box.style.display = 'block'; box.textContent = '没有识别到可填写的字段，试试打开面板补全资料，或手动填写该网站的自定义控件。'; return; }
    const ok = results.filter((r) => r.ok);
    const fail = results.filter((r) => !r.ok);
    const line = (r, sym) => `${sym} ${(FIELD_MAP[r.key] && FIELD_MAP[r.key].label) || r.key} ${r.note || ''}`;
    box.innerHTML = [
      ...ok.map((r) => line(r, '✅')),
      ...fail.map((r) => line(r, '⚠️')),
    ].join('<br>');
    box.style.display = 'block';
  }

  async function runFill() {
    const profile = saveProfile();
    const filled = ALL_FIELDS.filter((f) => (profile[f.key] || '').trim()).length
      + entryList(profile, 'internships').length + entryList(profile, 'projects').length;
    if (!filled) {
      togglePanel(true);
      toast('请先在面板中填写你的资料（至少一项）');
      return;
    }
    const panel = document.getElementById('caf-panel');
    const opts = {
      preview: panel ? panel.querySelector('[data-opt=preview]').checked : false,
      skipFilled: panel ? panel.querySelector('[data-opt=skipFilled]').checked : false,
    };
    toast(opts.preview ? '👀 预览模式：蓝色框为将填写的字段…' : '⚡ 正在填写…');
    const results = await handleFillRequest(profile, opts);
    const ok = results.filter((r) => r.ok).length;
    logResults(results);
    toast(opts.preview ? `预览完成：可填 ${ok} 项（蓝色高亮）` : `填写完成：本页及内嵌页共 ${ok} 项，详见面板日志`);
    togglePanel(true);
  }

  // 快捷键
  window.addEventListener('keydown', (e) => {
    if (!IS_TOP) return;
    if (e.altKey && !e.ctrlKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); runFill(); }
      if (k === 'e') { e.preventDefault(); togglePanel(); }
    }
  });

  // ------------------------------------------------------------------
  if (IS_TOP) {
    const boot = () => { try { buildUI(); } catch (e) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  try { if (typeof module !== 'undefined' && module.exports) module.exports = { radioGroups, matchRule, ctxOf, matchRuleFor, fillDoc }; } catch (e) {}
})();
