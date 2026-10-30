import { describe, expect, it } from "vitest";
import { bridgeCostRoutes, costCardPorts, costRouteConflicts, routeCostEdges, routeSegmentsConflict, shareCostRoutes, type RouteRect, type RoutedEdge } from "../costTreeRouting";

const intersects = (edge: RoutedEdge, box: RouteRect): boolean => edge.points.slice(1).some((b,i) => {
  const a=edge.points[i];
  return a.x===b.x
    ? a.x>box.left&&a.x<box.left+box.width&&Math.max(a.y,b.y)>box.top&&Math.min(a.y,b.y)<box.bottom
    : a.y>box.top&&a.y<box.bottom&&Math.max(a.x,b.x)>box.left&&Math.min(a.x,b.x)<box.left+box.width;
});

describe("공정 가계도 연결 통로", () => {
  it("우회하는 선도 출발·도착 카드 내부를 다시 관통하지 않는다", () => {
    const source={left:48,top:852,width:320,bottom:975};
    const target={left:500,top:852,width:320,bottom:975};
    const [edge]=routeCostEdges([{from:"AF",to:"AA",start:{x:368,y:913},end:{x:500,y:913},startSide:"right",endSide:"left"}],[source,target,{left:410,top:870,width:48,bottom:950}]);
    expect(edge.blocked).toBeFalsy();
    expect(intersects(edge,source)).toBe(false);
    expect(intersects(edge,target)).toBe(false);
  });
  it("다른 부모의 교차만 브리지로 구분하고 경로와 공통 줄기를 보존한다", () => {
    const edges=[{from:"p",to:"a",d:"M 0 50 H 100"},{from:"other",to:"b",d:"M 50 0 V 100"}];
    expect(bridgeCostRoutes(edges)[0]).toMatchObject({from:"p",to:"a",d:"M 0 50 H 46 Q 50 42 54 50 H 100"});
    expect(bridgeCostRoutes([{...edges[0]}, {...edges[1],from:"p"}])).toEqual([{...edges[0]}, {...edges[1],from:"p"}]);
  });
  it.each([
    [{left:0,top:0,width:410,bottom:127},{left:466,top:0,width:320,bottom:123}],
    [{left:0,top:0,width:410,bottom:220},{left:466,top:30,width:320,bottom:150}],
    [{left:466,top:30,width:320,bottom:150},{left:0,top:0,width:410,bottom:220}],
  ])("높이가 다른 같은 줄 카드도 수평 직선으로 연결한다", (source, target) => {
    const ports=costCardPorts(source,target);
    const [edge]=routeCostEdges([{from:"PF",to:"PA",...ports}],[source,target]);
    expect(ports.start.y).toBe(ports.end.y);
    expect(ports.start.y).toBeGreaterThan(Math.max(source.top,target.top));
    expect(ports.start.y).toBeLessThan(Math.min(source.bottom,target.bottom));
    expect(edge.points).toEqual([ports.start,ports.end]);
  });

  it("다른 줄의 카드는 기존 아래→위 연결점을 유지한다", () => {
    expect(costCardPorts({left:0,top:0,width:320,bottom:100},{left:48,top:180,width:320,bottom:280})).toEqual({start:{x:160,y:100},end:{x:208,y:180}});
  });
  it("가까운 부모·자식은 왼쪽 공통 통로로 우회하지 않는다", () => {
    const [edge]=routeCostEdges([{from:"parent",to:"child",start:{x:160,y:100},end:{x:160,y:200}}],[]);
    expect(edge.points).toEqual([{x:160,y:100},{x:160,y:200}]);
  });
  it("같은 줄의 F/A 카드는 좌우 포트로 짧게 연결한다", () => {
    const [edge]=routeCostEdges([{from:"AF",to:"AA",start:{x:320,y:60},end:{x:376,y:60},startSide:"right",endSide:"left"}],[]);
    expect(edge.points).toEqual([{x:320,y:60},{x:376,y:60}]);
  });

  it("긴 품명 카드와 제목을 16px 밖으로 우회한다", () => {
    const obstacles=[{left:80,top:130,width:160,bottom:210},{left:40,top:250,width:100,bottom:270}];
    const [edge]=routeCostEdges([{from:"p",to:"c",start:{x:160,y:80},end:{x:160,y:330}}],obstacles);
    for(const box of obstacles) expect(intersects(edge,{left:box.left-15,top:box.top-15,width:box.width+30,bottom:box.bottom+15})).toBe(false);
    expect(edge.points[0]).toEqual({x:160,y:80});
    expect(edge.points.at(-1)).toEqual({x:160,y:330});
  });

  it("격자 끝점에서 다른 계통의 선을 가로지르는 경우도 검출한다", () => {
    expect(routeSegmentsConflict({x:0,y:50},{x:50,y:50},{x:50,y:0},{x:50,y:100})).toBe(true);
    expect(routeSegmentsConflict({x:0,y:0},{x:50,y:0},{x:50,y:0},{x:50,y:100})).toBe(false);
  });

  it("다른 부모의 교차 경로와 자재 목록 줄기를 피해 통로를 배정한다", () => {
    const routes=routeCostEdges([
      {from:"p1",to:"a",start:{x:100,y:0},end:{x:100,y:250}},
      {from:"p2",to:"b",start:{x:300,y:0},end:{x:200,y:250}},
    ],[{left:120,top:50,width:60,bottom:180}]);
    expect(costRouteConflicts(routes)).toEqual([]);
    expect(routes).toHaveLength(2);
    const reserved=[{from:"material",points:[{x:150,y:100},{x:150,y:300}]}];
    const [edge]=routeCostEdges([{from:"other",to:"c",start:{x:100,y:20},end:{x:250,y:350}}],[],reserved);
    expect(edge.points.slice(1).some((b,i)=>routeSegmentsConflict(edge.points[i],b,reserved[0].points[0],reserved[0].points[1]))).toBe(false);
  });

  it("같은 부모의 공통 줄기를 한 번만 그리고 경로별 강조 정보를 보존한다", () => {
    const routes=routeCostEdges([
      {from:"p",to:"root/a:repeat",start:{x:100,y:0},end:{x:100,y:200}},
      {from:"p",to:"root/b:repeat",start:{x:100,y:0},end:{x:300,y:200}},
    ],[]);
    const shared=shareCostRoutes(routes);
    expect(shared.some(edge=>edge.bundle?.includes("root/a:repeat")&&edge.bundle.includes("root/b:repeat"))).toBe(true);
    expect(new Set(shared.map(edge=>edge.d)).size).toBe(shared.length);
    expect(new Set(shared.flatMap(edge=>edge.bundle??[edge.to]))).toEqual(new Set(["root/a:repeat","root/b:repeat"]));
  });

  it("많은 형제와 길이가 다른 목록을 누락 없이 배선한다", () => {
    const requests=Array.from({length:40},(_,i)=>({from:`p${i}`,to:`c${i}`,start:{x:i*352+160,y:100+(i%3)*20},end:{x:i*352+8,y:320}}));
    const boxes=requests.map(request=>({left:request.start.x-160,top:0,width:320,bottom:request.start.y}));
    const routes=routeCostEdges(requests,boxes);
    expect(routes).toHaveLength(requests.length);
    expect(costRouteConflicts(routes)).toEqual([]);
    for(const route of routes) for(let i=0;i<boxes.length;i++) if(route.from!==`p${i}`) expect(intersects(route,boxes[i])).toBe(false);
  });
});
