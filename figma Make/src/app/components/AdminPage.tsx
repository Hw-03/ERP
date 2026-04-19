import { useState } from 'react';
import { ShoppingBag, Users, ListTree, Shield, Settings } from 'lucide-react';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('product');

  const items = [
    { name: 'POWER LED', code: '3-AR-1', note: '원목에서 상품을 선택해 주세요' },
    { name: 'FRONT COVER (듀얼 슬라이드)', code: '3-AR-2-WM' },
    { name: 'REAR COVER', code: '3-AR-3-WM' },
    { name: 'LCD LED', code: '3-AR-4' },
    { name: 'EX LED (전측)', code: '3-AR-5' },
    { name: 'EX LED (오른측)', code: '3-AR-6' },
    { name: 'HAND STRAP', code: '3-AR-7' },
    { name: 'HAND STRAP 로고없을 사파리,이미지레즈용', code: '3-AR-8' },
    { name: '20cm CONE', code: '3-AR-9' },
    { name: 'LCD 인도우', code: '3-AR-10' },
    { name: '베터리커버', code: '' },
  ];

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-gray-500">ADMIN WORKSPACE</div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-xs">i</div>
            <span>관리자 데이터를 불러옵니다. 품목 971건 / 작원 8명</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <span>입출고 이력</span>
            </button>
            <button className="text-gray-400 hover:text-white">
              <span>🌙</span>
            </button>
            <button className="flex items-center gap-2 text-gray-400 hover:text-white">
              <Settings size={20} />
              <span className="text-sm">새로고침</span>
            </button>
          </div>
        </div>

        <h1 className="text-3xl text-white mb-8">관리자</h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('product')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'product'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ShoppingBag size={20} />
            <span>상품</span>
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'staff'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Users size={20} />
            <span>직원</span>
          </button>
          <button
            onClick={() => setActiveTab('bom')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'bom'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ListTree size={20} />
            <span>BOM</span>
          </button>
          <button
            onClick={() => setActiveTab('central')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'central'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Shield size={20} />
            <span>중앙목욕</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-purple-500 text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Settings size={20} />
            <span>설정</span>
          </button>
        </div>

        {/* Work Desk */}
        <div className="bg-[#1a1f2e] rounded-xl p-6 mb-6">
          <h2 className="text-xl text-white mb-2">관리자 작업대</h2>
          <p className="text-sm text-gray-400 mb-6">
            상품, 직원, BOM, 출하목욕, 설정을 한 권에에서 관리합니다.
          </p>

          {/* Items List */}
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 px-4 bg-[#0f1420] border border-gray-800 rounded-lg hover:bg-gray-800/50 transition-colors"
              >
                <div>
                  <div className="text-white">{item.name}</div>
                  <div className="text-sm text-gray-500">{item.code}</div>
                </div>
                {item.note && (
                  <div className="text-sm text-gray-500">{item.note}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg py-4 text-gray-400 hover:bg-gray-800 transition-colors">
          관리자 검급
        </button>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border-l border-gray-800 p-6">
        <h2 className="text-2xl text-white mb-4">관리자 메모</h2>

        <div className="mb-6">
          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            원재 속력에서 자주 하는 작업과 데이터 관고 모욕
          </p>

          <div className="bg-[#1a1f2e] rounded-xl p-4 mb-6">
            <h3 className="text-white mb-2">상품 북성에서는 레거치 메뉴 부드를 프</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              합한 입국 정보로 비로 주입할 수 없습니다.
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">편재 상태</span>
              <span className="text-white">품목 971건</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">작원 8명</span>
              <span className="text-white"></span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">출하목욕 1건</span>
              <span className="text-white"></span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-800">
              <span className="text-gray-400">BOM 0건</span>
              <span className="text-white"></span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-400">부서 수 10개</span>
              <span className="text-white"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
