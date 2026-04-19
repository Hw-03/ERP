import { Search, Sparkles, Moon, Settings } from 'lucide-react';

export default function InventoryPage() {
  const inventoryData = [
    {
      status: '정상',
      category: '조립자재',
      tag: '세',
      name: 'POWER LED',
      code: '3-AR-1',
      unit: '조립',
      current: 460,
      safe: '-',
      model: 'DX3000',
    },
    {
      status: '정상',
      category: '조립자재',
      tag: '세',
      name: 'FRONT COVER (듀얼 슬라이드)',
      code: '3-AR-2-WM',
      unit: '조립',
      current: 100,
      safe: '-',
      model: 'DX3000 화이트',
    },
    {
      status: '정상',
      category: '조립자재',
      tag: '세',
      name: 'REAR COVER',
      code: '3-AR-3-WM',
      unit: '조립',
      current: 210,
      safe: '-',
      model: 'DX3000 화이트',
    },
    {
      status: '정상',
      category: '조립자재',
      tag: '세',
      name: 'LCD LED',
      code: '3-AR-4',
      unit: '조립',
      current: 100,
      safe: '-',
      model: 'DX3000',
    },
  ];

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs">i</div>
            <span>재고 97건을 불러옵니다.</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <Sparkles size={16} />
              <span>입출고 이력</span>
            </button>
            <button className="text-gray-400 hover:text-white">
              <Moon size={20} />
            </button>
            <button className="flex items-center gap-2 text-gray-400 hover:text-white">
              <Settings size={20} />
              <span className="text-sm">새로고침</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a1f2e] border-2 border-blue-500 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">전체</div>
            <div className="text-4xl mb-1">971</div>
            <div className="text-gray-500 text-sm">총 재고 97,416</div>
          </div>
          <div className="bg-[#1a1f2e] border-b-4 border-green-500 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">정상</div>
            <div className="text-green-400 text-4xl mb-1">969</div>
            <div className="text-gray-500 text-sm">운영 가능 품목</div>
          </div>
          <div className="bg-[#1a1f2e] border-b-4 border-yellow-500 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">경고</div>
            <div className="text-yellow-400 text-4xl mb-1">2</div>
            <div className="text-gray-500 text-sm">안전재고 이하</div>
          </div>
          <div className="bg-[#1a1f2e] border-b-4 border-red-500 rounded-xl p-4">
            <div className="text-gray-400 text-sm mb-1">품절</div>
            <div className="text-red-400 text-4xl mb-1">0</div>
            <div className="text-gray-500 text-sm">재고 0 품목</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">전체</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">결자재</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">조립자재</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">발상부자재</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">완제품</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">미분류</button>
        </div>

        {/* Model Filter Tabs */}
        <div className="flex gap-2 mb-6">
          <button className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm">전체</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">공용</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">DX3000</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">ADX4000W</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">ADX6000</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">COCOON</button>
          <button className="px-4 py-2 bg-[#1a1f2e] text-gray-400 rounded-lg text-sm hover:bg-gray-700">SOLO</button>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#1a1f2e] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-cyan-400" />
              <span className="text-sm text-gray-400">즉시생산</span>
            </div>
            <div className="text-lg mb-1">오델렌 생산 가능 수량 보기</div>
            <div className="text-sm text-gray-500">출하전에 드론을 즉시 상대 가능 수량을 조합니다.</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-cyan-400" />
              <span className="text-sm text-gray-400">최대생산</span>
            </div>
            <div className="text-lg mb-1">오델렌 생산 가능 수량 보기</div>
            <div className="text-sm text-gray-500">출하전에 드론을 즉시 상대 가능 수량을 조합니다.</div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              placeholder="품명, 코드, 브랜드, 모델 검색"
              className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="text-sm text-gray-500 mt-2">정렬 가능 971개 / 결과 총 971개</div>
        </div>

        {/* Table */}
        <div className="bg-[#1a1f2e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400">설명</th>
                <th className="text-left px-4 py-3 text-gray-400">품목명</th>
                <th className="text-left px-4 py-3 text-gray-400">코드</th>
                <th className="text-left px-4 py-3 text-gray-400">단위</th>
                <th className="text-left px-4 py-3 text-gray-400">현재고</th>
                <th className="text-left px-4 py-3 text-gray-400">안전재고</th>
                <th className="text-left px-4 py-3 text-gray-400">모델</th>
              </tr>
            </thead>
            <tbody>
              {inventoryData.map((item, index) => (
                <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded text-xs">{item.status}</span>
                      <span className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded text-xs">{item.category}</span>
                      <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{item.tag}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white">{item.name}</td>
                  <td className="px-4 py-3 text-gray-400">{item.code}</td>
                  <td className="px-4 py-3 text-gray-400">{item.unit}</td>
                  <td className="px-4 py-3 text-white">{item.current}</td>
                  <td className="px-4 py-3 text-gray-400">{item.safe}</td>
                  <td className="px-4 py-3 text-gray-400">{item.model}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border-l border-gray-800 p-6">
        <div className="mb-8">
          <div className="w-12 h-12 bg-white rounded-xl mb-4"></div>
          <h3 className="text-xl text-white mb-2">품목을 선택해 주세요</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            가공와 속록에서 품목을 선택하여 실제 장보와 저리 내용을 여기에서 법출 관리합니다.
          </p>
        </div>

        <div>
          <div className="w-12 h-12 bg-white rounded-xl mb-4"></div>
          <h3 className="text-xl text-white mb-2">품목을 선택해 주세요</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            페고를 실시간 즐격을 그래프 같은 확인하여 실제 정보와 재의 법출 비교합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
