/**
 * Canonical initial data used both for Firestore seeding and as Zustand
 * store fallback. Keeping this in a standalone file avoids circular imports
 * between firestoreService ↔ rulesStore / taskStore.
 */
import type { AppSettings, Rule, Persona, Task } from '@/types';

// ── Settings ─────────────────────────────────────────────────
export const INITIAL_SETTINGS: AppSettings = {
  systemLanguage:  'zh',
  targetLanguage:  'de',
  translationLang: 'en',
  model:           'gpt-5.3-chat-latest',
  apiKey:          '',
  isSaved:         false,
  tinyfishApiKey:  'sk-tinyfish-8OQ6_m1WrQ3hFHqr7Wl9qikIAFaoynBk',
  isTinyfishSaved: true,
};

// ── Categories ───────────────────────────────────────────────
export const INITIAL_CATEGORIES: string[] = [
  '通用',
  'Wi-Fi 路由器',
  'Mesh 组网',
  '信号延伸器',
  '交换机',
  '网关',
  '移动宽带',
  '运营商设备',
  '电力线网络',
  'IP摄像头',
  '智能家居',
  '商用网络',
  '配件',
];

// ── Rules (COSMO-aligned) ─────────────────────────────────────
// COSMO (Customer Oracle for Semantic Machine Optimization) is Amazon's
// semantic ranking engine. It rewards natural language, specific/verifiable
// claims, and context-rich use-case descriptions over keyword stuffing.
export const INITIAL_RULES: Rule[] = [

  // ═══════════════════════════════════════════════════════════
  // GLOBAL — applies to every category
  // ═══════════════════════════════════════════════════════════

  // Title
  { id: 1,  category: '通用', type: 'instruction', targetSection: 'title',
    name: '标题格式：品牌名 + 型号 + 核心卖点（最多3项），总长 ≤ 200 字符',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 2,  category: '通用', type: 'instruction', targetSection: 'title',
    name: '标题必须包含无线标准（如 Wi-Fi 6 / Wi-Fi 7）或产品大类关键词',
    priority: 'Required', referenceAsins: [], active: true },

  // Bullets
  { id: 3,  category: '通用', type: 'instruction', targetSection: 'bullets',
    name: '每条卖点以【全大写特征词 + 冒号】开头，如 "WIFI 6 SPEED:" 或 "COVERAGE:"',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 4,  category: '通用', type: 'instruction', targetSection: 'bullets',
    name: '每条卖点聚焦单一价值点，技术参数须精确（如 4804 Mbps，而非 "约5000 Mbps"）',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 5,  category: '通用', type: 'instruction', targetSection: 'bullets',
    name: 'COSMO 语义优化：用真实使用场景描述功能（如 "同时连接 200+ 设备不卡顿" 而非堆砌关键词）',
    priority: 'Suggested', referenceAsins: [], active: true },

  // Description
  { id: 6,  category: '通用', type: 'instruction', targetSection: 'description',
    name: '描述须包含 2-3 个具体使用场景（如 "适合 200m² 大户型" 或 "支持 4K 视频同步串流"）',
    priority: 'Suggested', referenceAsins: [], active: true },

  { id: 7,  category: '通用', type: 'instruction', targetSection: 'description',
    name: '描述结尾可引导用户了解生态（如 Deco App / Tapo App / Omada），但禁止 CTA 促销语',
    priority: 'Suggested', referenceAsins: [], active: true },

  // Global negatives
  { id: 8,  category: '通用', type: 'negative', targetSection: 'all',
    name: '禁止绝对化/最高级词汇：best / fastest / world\'s first / 行业第一 / 最强',
    severity: 'Critical', active: true },

  { id: 9,  category: '通用', type: 'negative', targetSection: 'all',
    name: '禁止促销/紧迫性语言：Buy now / Limited offer / 限时 / 立即下单',
    severity: 'Critical', active: true },

  { id: 10, category: '通用', type: 'negative', targetSection: 'all',
    name: '禁止未经证实的安全承诺：军工级加密 / 无法被黑客攻击 / 100% 安全',
    severity: 'Critical', active: true },

  { id: 11, category: '通用', type: 'negative', targetSection: 'all',
    name: '禁止竞品品牌名：不得直接提及 ASUS / Netgear / Eero / Google Nest 等',
    severity: 'High', active: true },

  { id: 12, category: '通用', type: 'negative', targetSection: 'description',
    name: '描述中同一技术参数不得重复出现超过 2 次',
    severity: 'High', active: true },

  // ═══════════════════════════════════════════════════════════
  // Wi-Fi 路由器
  // ═══════════════════════════════════════════════════════════

  { id: 20, category: 'Wi-Fi 路由器', type: 'instruction', targetSection: 'title',
    name: '标题须包含 Wi-Fi 协议版本（Wi-Fi 6 / 6E / 7）及总速率（如 AX5400 / BE9300）',
    priority: 'Required', referenceAsins: ['B08TGPTQ14'], active: true },

  { id: 21, category: 'Wi-Fi 路由器', type: 'instruction', targetSection: 'bullets',
    name: '第1条：列出 5 GHz 和 2.4 GHz 各自的精准链路速率（如 4804 + 574 Mbps）',
    priority: 'Required', referenceAsins: ['B08TGPTQ14'], active: true },

  { id: 22, category: 'Wi-Fi 路由器', type: 'instruction', targetSection: 'bullets',
    name: '第2条：标注 OFDMA / MU-MIMO 支持情况及最大并发连接设备数',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 23, category: 'Wi-Fi 路由器', type: 'instruction', targetSection: 'bullets',
    name: '第3条：标注 WAN/LAN 端口规格（如 1× 2.5G WAN + 4× GbE LAN）及 USB 功能',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 24, category: 'Wi-Fi 路由器', type: 'instruction', targetSection: 'bullets',
    name: '第4条：说明覆盖面积（m²），天线数量及类型（全向/Beamforming）',
    priority: 'Suggested', referenceAsins: [], active: true },

  { id: 25, category: 'Wi-Fi 路由器', type: 'instruction', targetSection: 'bullets',
    name: '第5条：兼容性（Alexa / HomeKit / OneMesh 扩展）及 App 管理体验',
    priority: 'Suggested', referenceAsins: [], active: true },

  { id: 26, category: 'Wi-Fi 路由器', type: 'negative', targetSection: 'all',
    name: '禁止虚报总速率：如将 5 GHz + 2.4 GHz 速率相加后宣称为"最高速率"',
    severity: 'Critical', active: true },

  // ═══════════════════════════════════════════════════════════
  // Mesh 组网（Deco / 全屋 Wi-Fi — 标题、卖点、描述、禁区完整集）
  // ═══════════════════════════════════════════════════════════

  { id: 30, category: 'Mesh 组网', type: 'instruction', targetSection: 'title',
    name: '标题须含「TP-Link」+ Deco 系列型号 + Wi-Fi 代数（6 / 6E / 7）+ 套装节点规格（2-Pack / 3-Pack 等）；可含聚合速率档（AX/BE）与覆盖摘要，须与商详/包装一致',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 31, category: 'Mesh 组网', type: 'instruction', targetSection: 'title',
    name: '标题中覆盖面积、节点数、速率等级等数字须与规格页一致；禁止自行换算或四舍五入到未出现的标称值',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 32, category: 'Mesh 组网', type: 'instruction', targetSection: 'bullets',
    name: '第1条：写明套装内节点/路由器数量、建议覆盖面积（㎡ 或 sq ft 与包装一致）、适用户型（大平层/多层别墅/复式等具象化）',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 33, category: 'Mesh 组网', type: 'instruction', targetSection: 'bullets',
    name: '第2条：双频或三频结构；各频段角色；是否具备独立无线回传（dedicated wireless backhaul）；关键 PHY 或聚合速率须与规格表一致',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 34, category: 'Mesh 组网', type: 'instruction', targetSection: 'bullets',
    name: '第3条：无缝漫游须写可验证技术点（如 802.11k/v/r 等按实机支持如实书写），并配场景（走动视频通话/刷剧不断线）；禁止空洞「永不掉线」',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 35, category: 'Mesh 组网', type: 'instruction', targetSection: 'bullets',
    name: '第4条：Deco App（或官方文档载明的管理应用）仅写实际能力：快速安装、家长控制、QoS、设备列表、访客网络等；禁止未提供的功能',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 36, category: 'Mesh 组网', type: 'instruction', targetSection: 'bullets',
    name: '第5条：每节点以太网口数量与速率（千兆/2.5G 等）；是否支持有线回传（Ethernet backhaul）及一句典型拓扑（卫星节点有线接主节点）',
    priority: 'Suggested', referenceAsins: [], active: true },

  { id: 37, category: 'Mesh 组网', type: 'instruction', targetSection: 'bullets',
    name: '第6条：语音助手（Alexa 等）、HomeKit Router（若规格支持）、与其他 Deco / TP-Link OneMesh 路由混网扩展——须与官方兼容列表一致',
    priority: 'Suggested', referenceAsins: [], active: true },

  { id: 38, category: 'Mesh 组网', type: 'instruction', targetSection: 'description',
    name: '描述采用「场景 → 覆盖与漫游 → 管理与安全 → 扩展方式」结构，含 2–3 个具象用例（居家办公、儿童房、后院摄像头等）；首段禁止堆砌全部 Mbps',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 39, category: 'Mesh 组网', type: 'instruction', targetSection: 'description',
    name: '涉及宽带接入（DHCP / 静态 IP / PPPoE / VLAN Tagging 等）仅写「兼容常见家庭光纤/宽带接入方式」类概括，不写未经验证的运营商定制承诺',
    priority: 'Suggested', referenceAsins: [], active: true },

  { id: 100, category: 'Mesh 组网', type: 'negative', targetSection: 'all',
    name: '禁止将「单台标称覆盖 × 节点数」简单相乘为整网覆盖，除非包装/规格页明确给出套装总覆盖',
    severity: 'Critical', active: true },

  { id: 101, category: 'Mesh 组网', type: 'negative', targetSection: 'all',
    name: '禁止宣称未在规格出现的频段、未认证速率档或「全网最强覆盖」等不可证表述',
    severity: 'Critical', active: true },

  { id: 102, category: 'Mesh 组网', type: 'negative', targetSection: 'bullets',
    name: '禁止单条卖点内堆砌 3 个以上独立技术缩写而无一句人话解释（COSMO 不友好）',
    severity: 'High', active: true },

  { id: 103, category: 'Mesh 组网', type: 'negative', targetSection: 'description',
    name: '禁止在描述中暗示「取代运营商设备」「破解限速」等未授权表述',
    severity: 'Critical', active: true },

  // ═══════════════════════════════════════════════════════════
  // IP摄像头
  // ═══════════════════════════════════════════════════════════

  { id: 40, category: 'IP摄像头', type: 'instruction', targetSection: 'title',
    name: '标题须包含分辨率（1080p / 2K / 4K）及室内/室外使用场景',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 41, category: 'IP摄像头', type: 'instruction', targetSection: 'bullets',
    name: '第1条：视频规格（分辨率 + 帧率 + 视角 FOV）及夜视距离（m）',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 42, category: 'IP摄像头', type: 'instruction', targetSection: 'bullets',
    name: '第2条：AI 智能检测类型（人员 / 宠物 / 车辆 / 声音）及误报率说明',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 43, category: 'IP摄像头', type: 'instruction', targetSection: 'bullets',
    name: '第3条：存储方式（本地 microSD / 云存储订阅免费多少天）及加密协议',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 44, category: 'IP摄像头', type: 'negative', targetSection: 'description',
    name: '禁止在未认证情况下宣称"军工级加密"或"防黑客"',
    severity: 'Critical', active: true },

  // ═══════════════════════════════════════════════════════════
  // 商用网络
  // ═══════════════════════════════════════════════════════════

  { id: 50, category: '商用网络', type: 'instruction', targetSection: 'bullets',
    name: '必须标注管理方式（Omada SDN 云管理 / 控制器管理）及授权说明',
    priority: 'Required', referenceAsins: ['B08WBGFTTV'], active: true },

  { id: 51, category: '商用网络', type: 'instruction', targetSection: 'bullets',
    name: '标注 VLAN 数量、VPN 协议支持（OpenVPN / IPsec / L2TP）及 PoE 总预算（W）',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 52, category: '商用网络', type: 'negative', targetSection: 'all',
    name: '禁止使用面向个人消费者的口语化表达（如"家用够了"/"小白也能用"）',
    severity: 'High', active: true },

  // ═══════════════════════════════════════════════════════════
  // 信号延伸器
  // ═══════════════════════════════════════════════════════════

  { id: 60, category: '信号延伸器', type: 'instruction', targetSection: 'bullets',
    name: '须明确说明可扩展覆盖面积（m²）及与主路由器的兼容性（任意品牌 / OneMesh）',
    priority: 'Required', referenceAsins: [], active: true },

  { id: 61, category: '信号延伸器', type: 'instruction', targetSection: 'bullets',
    name: '标注信号接入/回传方式：双频同传 vs 三频（独立回传带宽）',
    priority: 'Suggested', referenceAsins: [], active: true },

  // ═══════════════════════════════════════════════════════════
  // 配件
  // ═══════════════════════════════════════════════════════════

  { id: 70, category: '配件', type: 'instruction', targetSection: 'bullets',
    name: '必须标注接口标准（USB-C Gen2 / RJ45 2.5G 等）及最大输出/传输规格',
    priority: 'Required', referenceAsins: [], active: true },
];

// ── Personas ─────────────────────────────────────────────────
export const INITIAL_PERSONAS: Persona[] = [
  { id: 'p1', name: '智能家居新手',    description: '偏好简单易懂的设置说明，强调Tapo App控制、语音助手兼容性（Alexa/Google）和家庭安全性。排斥复杂的网络术语。' },
  { id: 'p2', name: '科技发烧友/极客', description: '极度关注吞吐量(Mbps)、频段(Tri-band/Wi-Fi 7)、端口规格(2.5G/10G)及低延迟表现。要求参数精准、硬核。' },
  { id: 'p3', name: '大户型家庭用户',  description: '关注信号覆盖面积、穿墙能力、Mesh组网扩展性(Deco系列)及无缝漫游体验。' },
  { id: 'p4', name: '中小企业网管',    description: '关注VLAN、VPN支持、PoE供电、集中云化管理(Omada SDN)及企业级安全性。' },
];

// ── Tasks ────────────────────────────────────────────────────
export const INITIAL_TASKS: Task[] = [
  { id: '1', asin: 'B08TGPTQ14', name: 'TP-Link Archer AX73',  category: 'Wi-Fi 路由器', language: 'en', personaIds: ['p2', 'p3'], status: 'review',   createdAt: new Date().toISOString() },
  { id: '3', asin: 'B08TH4D3QV', name: 'TP-Link Deco X20',    category: 'Mesh 组网',    language: 'de', personaIds: ['p3'],        status: 'review',   createdAt: new Date().toISOString() },
  { id: '4', asin: 'B08P1X6LXC', name: 'TP-Link Tapo C200',   category: 'IP摄像头',     language: 'es', personaIds: ['p1'],        status: 'review',   createdAt: new Date().toISOString() },
  { id: '2', asin: 'B08WBGFTTV', name: 'TP-Link TL-SG105PE',  category: '交换机',       language: 'en', personaIds: ['p4'],        status: 'archived', createdAt: new Date().toISOString() },
];
