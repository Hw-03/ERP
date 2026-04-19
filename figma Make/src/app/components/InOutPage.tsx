import { Search, Users, Package, TrendingUp, TrendingDown } from 'lucide-react';

export default function InOutPage() {
  const recentItems = [
    { name: 'POWER LED', code: '3-AR-1 / - / BA-000001', quantity: 460 },
    { name: 'FRONT COVER (듀얼 슬라이드)', code: '3-AR-2-WM / - / BA-000002', quantity: 100 },
    { name: 'REAR COVER', code: '3-AR-3-WM / - / BA-000003', quantity: 210 },
    { name: 'LCD LED', code: '3-AR-4 / - / BA-000004', quantity: 100 },
    { name: 'EX LED (전측)', code: '3-AR-5 / - / BA-000005', quantity: 30 },
    { name: 'EX LED (오른측)', code: '3-AR-6 / - / BA-000006', quantity: 30 },
  ];

  const staff = [
    { name: '박서민', color: 'bg-amber-600' },
    { name: '이도현', color: 'bg-purple-600' },
    { name: '최민지', color: 'bg-cyan-600' },
    { name: '정예준', color: 'bg-green-600' },
    { name: '한유진', color: 'bg-gray-600' },
    { name: '오지호', color: 'bg-orange-600' },
    { name: '윤가은', color: 'bg-purple-400' },
    { name: '문형우', color: 'bg-gray-500' },
  ];

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs">i</div>
            <span>입출고를 작성 8명, 품목 971건, 코지기 1건을 불러옵니다.</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <span>입출고 이력</span>
            </button>
            <button className="text-gray-400 hover:text-white">
              <span>🌙</span>
            </button>
          </div>
        </div>

        <h1 className="text-3xl text-white mb-8">입출고 처리</h1>

        {/* Work Type Selection */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-sm">1</div>
            <h2 className="text-lg text-white">작업 유형 선택</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <button className="bg-emerald-900/40 border border-emerald-700 rounded-xl p-3 text-left hover:bg-emerald-900/60 transition-colors">
              <Package className="w-6 h-6 text-emerald-400 mb-2" />
              <div className="text-white mb-0.5">원자재 입출고</div>
              <div className="text-sm text-gray-400">오째 ↔ 목고</div>
            </button>
            <button className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-3 text-left hover:bg-gray-800 transition-colors">
              <TrendingDown className="w-6 h-6 text-gray-400 mb-2" />
              <div className="text-white mb-0.5">장고 입출고</div>
              <div className="text-sm text-gray-400">목고 ↔ 목시</div>
            </button>
            <button className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-3 text-left hover:bg-gray-800 transition-colors">
              <Package className="w-6 h-6 text-gray-400 mb-2" />
              <div className="text-white mb-0.5">부서 입출고</div>
              <div className="text-sm text-gray-400">공법 낸품 거리</div>
            </button>
            <button className="bg-[#1a1f2e] border border-gray-700 rounded-xl p-3 text-left hover:bg-gray-800 transition-colors">
              <TrendingUp className="w-6 h-6 text-gray-400 mb-2" />
              <div className="text-white mb-0.5">폐기와 조정</div>
              <div className="text-sm text-gray-400">목품 플러 거리</div>
            </button>
          </div>
        </div>

        {/* Staff Selection */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg text-white">담당 직원</h2>
          </div>
          <div className="flex gap-4">
            {staff.map((person, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 ${person.color} rounded-full flex items-center justify-center text-white`}>
                  {person.name[0]}
                </div>
                <span className="text-sm text-gray-400">{person.name}</span>
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-500 mt-4">품목 선택</div>
        </div>

        {/* Quick Filters */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-blue-400">📋 원자재 조립자재 발상부자재 완제품 미분류</span>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-blue-400">📦 공용 DX3000 ADX4000W ADX6000 COCOON SOLO</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              placeholder="코드, 품명, 브랜드, 모델 검색"
              className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Recent Items */}
        <div className="bg-[#1a1f2e] rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-4">200개 품목</div>
          {recentItems.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 px-2 rounded"
            >
              <div>
                <div className="text-white mb-1">{item.name}</div>
                <div className="text-sm text-gray-500">{item.code}</div>
              </div>
              <div className="text-emerald-400">{item.quantity}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border-l border-gray-800 p-6">
        <h2 className="text-2xl text-white mb-4">실행 확인</h2>

        <div className="mb-8">
          <div className="w-12 h-12 bg-white rounded-xl mb-4"></div>
          <h3 className="text-xl text-white mb-2">품목을 선택해 주세요</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            작업 유형을 고른 후 담당 직원과 품목을 선택하면 실행 할 내용이 표시합니다.
          </p>
        </div>

        <div className="flex gap-3 mt-auto">
          <button className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-3 text-sm transition-colors">
            작고 입고
            <div className="text-xs opacity-70">입고 ↔ 목고</div>
          </button>
          <button className="flex-1 bg-red-900/40 hover:bg-red-900/60 text-white rounded-lg py-3 text-sm transition-colors">
            작고 출고
            <div className="text-xs opacity-70">목고 ↔ 목시</div>
          </button>
        </div>
      </div>
    </div>
  );
}
