import { useMemo, useState } from 'react';
import { X, BookOpenText } from 'lucide-react';

type GuideLanguage = 'zh' | 'en';

interface GuideSection {
  title: string;
  items: string[];
}

interface GuideContent {
  title: string;
  subtitle: string;
  quickStartTitle: string;
  quickStartSteps: string[];
  sections: GuideSection[];
}

interface UserGuideModalProps {
  onClose: () => void;
}

const GUIDE_CONTENT: Record<GuideLanguage, GuideContent> = {
  zh: {
    title: 'Right First Time 使用指南',
    subtitle: '覆盖核心功能：抓取、编辑、规则、图片优化、共享库、审批与设置',
    quickStartTitle: '快速上手（5 步）',
    quickStartSteps: [
      '在「系统设置」先保存 LLM API Key 与 TinyFish API Key。',
      '点击「新建任务」，输入 Amazon/官网 URL，先单条试跑确认字段质量。',
      '在工作区编辑标题/卖点/描述，按需执行 AI 重写与翻译。',
      '检查媒体分析区（图片/specs/A+），必要时执行 AI 主图优化。',
      '确认内容后点击「入库」，把该国家版本发布到共享资源库。',
    ],
    sections: [
      {
        title: '1) 登录与权限',
        items: [
          '支持邮箱登录/注册/找回密码；普通账号需要邮箱验证。',
          '账号绑定国家工作台（UK/DE/IT/ES/FR/BE/NL/PL/SE），数据按国家隔离。',
          'Admin 为 GLOBAL 视角，可跨国家查看与管理。',
        ],
      },
      {
        title: '2) 新建任务与批量抓取',
        items: [
          '支持单条和批量 URL（每行一个）；可选择提取字段：卖点/描述/价格/specs/图片/A+。',
          '单条流程：抓取日志 -> 预览 -> 填写标准 Model -> 创建任务。',
          '批量流程：串行队列执行，可最小化窗口在后台继续抓取。',
        ],
      },
      {
        title: '3) TinyFish 抓取结果',
        items: [
          '结构化字段包含：title、asin、brand、price、bullets、description、specs、images、aplus。',
          'Amazon 链接会优先过滤 review/UGC 噪声图，聚焦主画廊 overview 图片。',
          '抓取失败时建议先检查 URL 可访问性、站点地区与 API Key。',
        ],
      },
      {
        title: '4) AI 工作区（重写/翻译）',
        items: [
          '可按区块（标题/卖点/描述）或全局执行 AI 重写。',
          '支持全局翻译或单区块翻译；翻译结果会和正文一起持久化。',
          '编辑器内容会自动保存，减少刷新后内容丢失风险。',
        ],
      },
      {
        title: '5) 规则、画像、关键词',
        items: [
          '规则按类目管理：生成规则（instruction）+ 风控红线（negative）。',
          '可为任务勾选 persona，影响文案语气与风格。',
          '每个类目可维护主关键词、次关键词、参考 ASIN，直接影响 AI 输出策略。',
        ],
      },
      {
        title: '6) 媒体分析与图片优化',
        items: [
          '媒体区展示产品图片、规格参数、A+ 模块。',
          '支持按 ASIN 一键下载图片。',
          '支持 AI 优化主图（队列执行、失败重试、结果持久化存储）。',
        ],
      },
      {
        title: '7) 共享库与国家协同',
        items: [
          '共享资源库可查看其他国家已审批的 model 快照。',
          '支持导入到我的国家工作台，快速复用成熟内容。',
          '工作区顶部国家标签可切换查看各国家版本并进行复制参考。',
        ],
      },
      {
        title: '8) 审批入库与撤回',
        items: [
          '点击「入库」会把当前编辑结果写入该国家 listing，并发布到共享库。',
          '入库后任务状态变为「已审核」。',
          '如需返工，可执行「撤回审核」，任务会回到可编辑状态。',
        ],
      },
      {
        title: '9) 设置建议',
        items: [
          '系统语言与目标语言分开管理：系统语言是界面语言，目标语言是任务默认语种。',
          'API Key 变更建议按国家维度维护并记录审计。',
          '首次上线前建议先做 2-3 个 benchmark 任务，提升 AI 重写稳定性。',
        ],
      },
    ],
  },
  en: {
    title: 'Right First Time Guide',
    subtitle: 'Core capabilities: scraping, editing, rules, image optimization, shared library, approval, settings',
    quickStartTitle: 'Quick Start (5 Steps)',
    quickStartSteps: [
      'Save your LLM API key and TinyFish API key in Settings first.',
      'Create a new task with Amazon/official URLs and run a single-item check first.',
      'Edit title/bullets/description in Workspace, then run AI rewrite/translation.',
      'Review Media Analysis (images/specs/A+) and run AI main-image optimization if needed.',
      'Click Approve to publish the country listing into Shared Library.',
    ],
    sections: [
      {
        title: '1) Authentication & Access',
        items: [
          'Supports email sign-up/sign-in/password reset; non-admin users require email verification.',
          'Each account is bound to a country workspace (UK/DE/IT/ES/FR/BE/NL/PL/SE).',
          'Admin runs in GLOBAL scope and can manage cross-country data.',
        ],
      },
      {
        title: '2) Task Creation & Batch Fetch',
        items: [
          'Create tasks with single or multi-line URLs; choose fetch fields (bullets/description/price/specs/images/A+).',
          'Single flow: fetch logs -> preview -> fill standard Model -> create task.',
          'Batch flow is queued serially and can continue in background when minimized.',
        ],
      },
      {
        title: '3) TinyFish Structured Output',
        items: [
          'Output fields include title, asin, brand, price, bullets, description, specs, images, and aplus.',
          'For Amazon URLs, the pipeline prefers overview gallery images and filters review/UGC noise.',
          'If extraction fails, check URL accessibility, marketplace region, and API key.',
        ],
      },
      {
        title: '4) AI Workspace (Rewrite & Translate)',
        items: [
          'Run AI rewrite per section (title/bullets/description) or globally.',
          'Run global or per-section translation and keep translations persisted.',
          'Manual edits are auto-saved to reduce loss on refresh.',
        ],
      },
      {
        title: '5) Rules, Personas, Keywords',
        items: [
          'Rules are category-scoped: instruction rules + negative constraints.',
          'Task personas steer tone and audience style.',
          'Category-level primary/secondary keywords and reference ASINs shape AI generation.',
        ],
      },
      {
        title: '6) Media Analysis & Image Optimization',
        items: [
          'Media panel includes product images, spec table, and A+ modules.',
          'Supports one-click image bulk download by ASIN.',
          'Supports AI main-image optimization with queueing, retry, and persisted outputs.',
        ],
      },
      {
        title: '7) Shared Library & Country Collaboration',
        items: [
          'Browse approved models from other countries in Shared Library.',
          'Import approved snapshots into your country workspace.',
          'Use country tags in Workspace header to preview/copy country variants.',
        ],
      },
      {
        title: '8) Approve, Publish, Withdraw',
        items: [
          'Approve writes current edits into country listing and publishes to shared library.',
          'Approved tasks move into archived status.',
          'Withdraw moves the listing back to editable review flow.',
        ],
      },
      {
        title: '9) Settings Best Practices',
        items: [
          'System language and target language are separate controls.',
          'Manage API keys per country and keep audit visibility.',
          'Create 2-3 benchmark tasks early to stabilize rewrite quality.',
        ],
      },
    ],
  },
};

export function UserGuideModal({ onClose }: UserGuideModalProps) {
  const [language, setLanguage] = useState<GuideLanguage>('zh');
  const content = useMemo(() => GUIDE_CONTENT[language], [language]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <BookOpenText size={18} className="text-[#0052D9]" />
              <span className="truncate">{content.title}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">{content.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex border border-slate-200 rounded-lg p-0.5 bg-white">
              <button
                type="button"
                onClick={() => setLanguage('zh')}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  language === 'zh' ? 'bg-[#0052D9] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-3 py-1.5 text-xs rounded-md transition ${
                  language === 'en' ? 'bg-[#0052D9] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                English
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex items-center justify-center"
              aria-label="Close guide"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-y-auto p-6 space-y-5">
          <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <h4 className="text-sm font-semibold text-[#0052D9] mb-2">{content.quickStartTitle}</h4>
            <ol className="space-y-1.5 text-[13px] text-slate-700 list-decimal pl-5">
              {content.quickStartSteps.map((step, idx) => (
                <li key={`quick-${idx}`} className="leading-relaxed">{step}</li>
              ))}
            </ol>
          </section>

          {content.sections.map((section) => (
            <section key={section.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-800 mb-2">{section.title}</h4>
              <ul className="space-y-1.5 text-[13px] text-slate-600 list-disc pl-5">
                {section.items.map((item, idx) => (
                  <li key={`${section.title}-${idx}`} className="leading-relaxed">{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
