export type AssemblyChecklistSection = {
  title?: string;
  items: readonly string[];
};

export type AssemblyChecklistProductId = "dx3000" | "adx6000";

export type AssemblyChecklistProduct = {
  id: AssemblyChecklistProductId;
  label: string;
  sections: readonly AssemblyChecklistSection[];
};

export const ASSEMBLY_CHECKLISTS: readonly AssemblyChecklistProduct[] = [
  {
    id: "dx3000",
    label: "DX3000",
    sections: [
      {
        title: "전원 OFF",
        items: [
          "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인",
          "차폐 납 부착 상태 양호",
          "하네스 연결 상태 양호\n- FFC 케이블 방향에 맞게 잘 연결하였는지 사출 체결 시 걸리지 않게 잘 부착하였는지 확인",
          "조립 상태(내부) 양호\n- 제품 안쪽 굴러다니는 이물질 확인(CTR BD 이물질 확인)",
          "조립 상태(외부) 양호\n- 제품 외관 확인",
          "WINDOW 부착 상태 양호\n- 방향이 맞는지, 상처가 없는지, 이물질이 들어갔는지 확인",
          "LCD BD의 리모컨 잭 부분이 FRONT COVER 홀 부분의 들어갔는지 확인",
          "각 발생부, LCD, 사출의 시리얼라벨이 정상적으로 부착되어있고 \n제품공정카드에 정상적으로 기입되어있는지 확인",
          "+-라벨이 정상적으로 부착되어있는지 확인",
        ],
      },
      {
        title: "전원 ON",
        items: [
          "펌웨어가 정상적으로 들어갔는지 확인",
          "전원버튼의 녹색 LED가 점등되는지 확인",
          "버튼의 눌림 상태와 각 버튼간의 상호적인 눌림이 없는지 확인",
          "화면의 글자 깨짐이 있는지 확인",
          "밝기의 차이 및 Backlight의 상태를 확인",
          "전원 On/Off 및 Exposure시 부저음 확인",
          "엑스선이 조사중일 때 황색 LED의 점등을 확인",
          "Slide Switch를 사용하여 Right, Left의 EX Button 동작을 확인",
        ],
      },
    ],
  },
  {
    id: "adx6000",
    label: "ADX6000",
    sections: [
      {
        items: [
          "LCD 열고닫을때 소리안나는지 확인",
          "차폐 납 부착 상태 양호 확인",
          "하네스 연결 상태 양호 확인\n-하네스 연결 및 정리 상태 확인",
          "조립 상태(내부) 양호 확인\n- 제품 안쪽 굴러다니는 이물질 확인",
          "조립 상태(외부) 양호 확인\n- 제품 외관 확인",
          "CTR BD 및 발생부 연결 상태 양호\n-사출에 빠지지 않고 잘 연결되어 있는지 확인",
          "배터리 6핀 하네스 정배열맞는지 확인 (가끔 2핀3핀 엇갈려있는 하네스가 있음)",
          "6홀 알루미늄 브라켓 안흔들리는지 확인",
          "배터리 단자 위치 확인",
          "컬리메이터 날개 위치 확인\n-컬리메이터가 안돌아가도록 방향에 맞게 고정되어야함",
          "각 발생부, LCD, 사출 등의 시리얼라벨이 정상적으로 부착되어있고 \n제품공정카드에 정상적으로 기입되어있는지 확인",
          "부직포 상태 양호 확인",
          "POWER BUTTON이 정상적으로 눌리는지 확인",
        ],
      },
    ],
  },
];
