import { Search, Sparkles, Moon, Settings } from 'lucide-react';

export function Inventory() {
  const products = [
    { id: 1, status: '정상', name: 'POWER LED', code: '3-AR-1', unit: '조립', quantity: 460, cost: '-', model: 'DX3000', note: '-', color: 'green' },
    { id: 2, status: '정상', name: 'FRONT COVER (듀얼 슬라이드)', code: '3-AR-2-WM', unit: '조립', quantity: 100, cost: '-', model: 'DX3000 화이트', note: '-', color: 'green' },
    { id: 3, status: '정상', name: 'REAR COVER', code: '3-AR-3-WM', unit: '조립', quantity: 210, cost: '-', model: 'DX3000 화이트', note: '-', color: 'green' },
    { id: 4, status: '정상', name: 'LCD LED', code: '3-AR-4', unit: '조립', quantity: 100, cost: '-', model: 'DX3000', note: '-', color: 'green' },
  ];

  return (
    <div className="h-full flex">
      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs">i</span>
            재고 97건을 불러옵니다.
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 text-gray-400 hover:text-white">
              <Sparkles className="w-4 h-4" />
              입출고 이력
            </button>
            <button className="text-gray-400 hover:text-white">
              <Moon className="w-5 h-5" />
            </button>
            <button className="flex items-center gap-2 text-gray-400 hover:text-white">
              <Settings className="w-5 h-5" />
              새로고침
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="품명, 코드, 브랜드, 모델 검색"
              className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
            <span>정렬 가능 971개 / 전체 속록 971개</span>
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

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a1f2e] border-2 border-blue-500 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">전체</div>
            <div className="text-3xl mb-1">971</div>
            <div className="text-gray-500 text-sm">총 재고 97,416</div>
          </div>
          <div className="bg-[#1a1f2e] border-b-2 border-green-500 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">정상</div>
            <div className="text-green-400 text-3xl mb-1">969</div>
            <div className="text-gray-500 text-sm">운영 가능 품목</div>
          </div>
          <div className="bg-[#1a1f2e] border-b-2 border-yellow-500 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">경고</div>
            <div className="text-yellow-400 text-3xl mb-1">2</div>
            <div className="text-gray-500 text-sm">안전재고 이하</div>
          </div>
          <div className="bg-[#1a1f2e] border-b-2 border-red-500 rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">품절</div>
            <div className="text-red-400 text-3xl mb-1">0</div>
            <div className="text-gray-500 text-sm">재고 0 품목</div>
          </div>
        </div>

        {/* Alerts */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-[#1a1f2e] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-400">즉시재전</span>
            </div>
            <div className="text-lg mb-2">오델렌 설산 가능 수량 보기</div>
            <div className="text-sm text-gray-400">출하전에 드론을 준비 상대 가능 수량을 조합니다.</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-400">최대경성</span>
            </div>
            <div className="text-lg mb-2">오델렌 설산 가능 수량 보기</div>
            <div className="text-sm text-gray-400">출하전에 드론을 준비 상대 가능 수량을 조합니다.</div>
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-[#1a1f2e] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-sm text-gray-400">설명</th>
                <th className="text-left p-4 text-sm text-gray-400">품목명</th>
                <th className="text-left p-4 text-sm text-gray-400">코드</th>
                <th className="text-left p-4 text-sm text-gray-400">단위</th>
                <th className="text-left p-4 text-sm text-gray-400">현재고</th>
                <th className="text-left p-4 text-sm text-gray-400">안전재고</th>
                <th className="text-left p-4 text-sm text-gray-400">모델</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="p-4">
                    <div className="flex gap-2">
                      <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs">정상</span>
                      <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs">조립자재</span>
                      <span className="px-2 py-1 bg-gray-700 text-gray-400 rounded text-xs">세</span>
                    </div>
                  </td>
                  <td className="p-4">{product.name}</td>
                  <td className="p-4 text-gray-400">{product.code}</td>
                  <td className="p-4 text-gray-400">{product.unit}</td>
                  <td className="p-4">{product.quantity}</td>
                  <td className="p-4 text-gray-400">{product.cost}</td>
                  <td className="p-4 text-gray-400">{product.model}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 bg-[#0f1420] border-l border-gray-800 p-6">
        <div className="mb-8">
          <div className="w-12 h-12 bg-white rounded-lg mb-4"></div>
          <h2 className="text-xl mb-2">품목을 선택해 주세요</h2>
          <p className="text-sm text-gray-400">가공와 속록에서 품목을 선택하여 실제 장보와 저리 내용을 여기에서 법출 관리합니다.</p>
        </div>

        <div className="mb-8">
          <div className="w-12 h-12 bg-white rounded-lg mb-4"></div>
          <h2 className="text-xl mb-2">품목을 선택해 주세요</h2>
          <p className="text-sm text-gray-400">페고를 실시간 즐격을 그래프 같은 확인하여 실제 정보와 재의 법출 비교합니다.</p>
        </div>
      </div>
    </div>
  );
}
