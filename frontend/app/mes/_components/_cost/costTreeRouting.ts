export type RoutePoint = {
    x: number;
    y: number;
};
export type RouteRect = {
    left: number;
    top: number;
    width: number;
    bottom: number;
};
export type RouteRequest = {
    from: string;
    to: string;
    start: RoutePoint;
    end: RoutePoint;
    bundle?: string[];
    startSide?: "left" | "right" | "top" | "bottom";
    endSide?: "left" | "right" | "top" | "bottom";
};
export type RoutedEdge = RouteRequest & {
    d: string;
    points: RoutePoint[];
    blocked?: boolean;
};
type Segment = {
    a: RoutePoint;
    b: RoutePoint;
    owner: string;
};
const CLEARANCE = 16;
const TRACK = 12;
/** Side-by-side cards share one port height even when wrapping changes their sizes. */
export function costCardPorts(source: RouteRect, target: RouteRect): Pick<RouteRequest, "start" | "end" | "startSide" | "endSide"> {
    if (target.top < source.bottom && target.bottom > source.top) {
        const right = target.left >= source.left + source.width;
        const y = (Math.max(source.top, target.top) + Math.min(source.bottom, target.bottom)) / 2;
        return {
            start: { x: right ? source.left + source.width : source.left, y },
            end: { x: right ? target.left : target.left + target.width, y },
            startSide: right ? "right" : "left", endSide: right ? "left" : "right",
        };
    }
    return { start: { x: source.left + source.width / 2, y: source.bottom }, end: { x: target.left + target.width / 2, y: target.top } };
}

/** Open interiors allow a route to travel on a reserved obstacle boundary. */
function hits(a: RoutePoint, b: RoutePoint, box: RouteRect): boolean {
    const right = box.left + box.width;
    return a.x === b.x
        ? a.x > box.left && a.x < right && Math.max(a.y, b.y) > box.top && Math.min(a.y, b.y) < box.bottom
        : a.y > box.top && a.y < box.bottom && Math.max(a.x, b.x) > box.left && Math.min(a.x, b.x) < right;
}
/** Detect crossings and coincident runs; endpoints alone do not form a shared wire. */
export function routeSegmentsConflict(a: RoutePoint, b: RoutePoint, c: RoutePoint, d: RoutePoint): boolean {
    const vertical = a.x === b.x, otherVertical = c.x === d.x;
    if (vertical === otherVertical)
        return vertical
            ? a.x === c.x && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) < Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
            : a.y === c.y && Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) < Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    const v = vertical ? [a, b] : [c, d], h = vertical ? [c, d] : [a, b];
    const intersection = { x: v[0].x, y: h[0].y };
    const sharedEndpoint = [a, b].some(p => p.x === intersection.x && p.y === intersection.y) && [c, d].some(p => p.x === intersection.x && p.y === intersection.y);
    return !sharedEndpoint && v[0].x >= Math.min(h[0].x, h[1].x) && v[0].x <= Math.max(h[0].x, h[1].x) && h[0].y >= Math.min(v[0].y, v[1].y) && h[0].y <= Math.max(v[0].y, v[1].y);
}

/** Parallel nets reserve twelve pixels only where their runs overlap. */
function trackConflict(a:RoutePoint,b:RoutePoint,c:RoutePoint,d:RoutePoint):boolean {
    if(routeSegmentsConflict(a,b,c,d))return true;
    if(a.x===b.x&&c.x===d.x) return Math.abs(a.x-c.x)<TRACK && Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y));
    if(a.y===b.y&&c.y===d.y) return Math.abs(a.y-c.y)<TRACK && Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x));
    return false;
}
/** Paint a shared trunk once and retain the exact occurrence paths using each section. */
export function shareCostRoutes(routes: RoutedEdge[]): {
    from: string;
    to: string;
    bundle?: string[];
    d: string;
}[] {
    const groups = new Map<string, {
        from: string;
        vertical: boolean;
        fixed: number;
        parts: {
            lo: number;
            hi: number;
            paths: string[];
        }[];
    }>();
    for (const route of routes)
        for (let i = 1; i < route.points.length; i++) {
            const a = route.points[i - 1], b = route.points[i], vertical = a.x === b.x, fixed = vertical ? a.x : a.y;
            const key = `${route.from}:${vertical}:${fixed}`, group = groups.get(key) ?? { from: route.from, vertical, fixed, parts: [] };
            group.parts.push({ lo: Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x), hi: Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x), paths: route.bundle ?? [route.to] });
            groups.set(key, group);
        }
    return [...groups.values()].flatMap(group => {
        const cuts = [...new Set(group.parts.flatMap(part => [part.lo, part.hi]))].sort((a, b) => a - b);
        return cuts.slice(1).flatMap((hi, i) => {
            const lo = cuts[i], paths = [...new Set(group.parts.filter(part => part.lo <= lo && part.hi >= hi).flatMap(part => part.paths))];
            if (!paths.length)
                return [];
            return [{ from: group.from, to: paths[0], bundle: paths.length > 1 ? paths : undefined, d: group.vertical ? `M ${group.fixed} ${lo} V ${hi}` : `M ${lo} ${group.fixed} H ${hi}` }];
        });
    });
}
/** Return only crossings between different BOM parents, excluding their shared card ports. */
export function costRouteConflicts(routes: RoutedEdge[]): RoutedEdge[] {
    const conflicts = new Set<RoutedEdge>(routes.filter(route => route.blocked));
    for (let i = 0; i < routes.length; i++)
        for (let j = i + 1; j < routes.length; j++) {
            const a = routes[i], b = routes[j];
            if (a.from === b.from)
                continue;
            for (let x = 1; x < a.points.length; x++)
                for (let y = 1; y < b.points.length; y++) {
                    if (trackConflict(a.points[x - 1], a.points[x], b.points[y - 1], b.points[y])) {
                        conflicts.add(a);
                        conflicts.add(b);
                    }
                }
        }
    return [...conflicts];
}
/** Fixed orthogonal corridors avoid layout feedback and whole-board grid searches. */
export function routeCostEdges(requests: RouteRequest[], obstacles: RouteRect[], _reserved: Pick<RoutedEdge, "from" | "points">[] = []): RoutedEdge[] {
    const occupied = _reserved.flatMap(route=>route.points.slice(1).map((b,i)=>({a:route.points[i],b,from:route.from})));
    const parents = [...new Set(requests.map(r=>r.from))];
    const boundary = Math.min(0,...obstacles.map(b=>b.left))-CLEARANCE;
    return requests.map(request => {
        const {start:s,end:t}=request;
        const vectors={left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}};
        const a=vectors[request.startSide??"bottom"],b=vectors[request.endSide??"top"];
        const exit={x:s.x+a.x*CLEARANCE,y:s.y+a.y*CLEARANCE};
        const entry={x:t.x+b.x*CLEARANCE,y:t.y+b.y*CLEARANCE};
        const boxes=obstacles.map(box=>{
            const own=[s,t].some(p=>p.x>=box.left&&p.x<=box.left+box.width&&p.y>=box.top&&p.y<=box.bottom);
            return own?box:{left:box.left-CLEARANCE,top:box.top-CLEARANCE,width:box.width+2*CLEARANCE,bottom:box.bottom+CLEARANCE};
        });
        const clear=(points:RoutePoint[]):boolean=>points.slice(1).every((p,i)=>!boxes.some(box=>hits(points[i],p,box)));
        const compact=(middle:RoutePoint[]):RoutePoint[]=>{
            const points=[s,...middle,t].filter((p,i,all)=>!i||p.x!==all[i-1].x||p.y!==all[i-1].y);
            for(let i=points.length-2;i>0;i--) if(points[i-1].x===points[i].x&&points[i].x===points[i+1].x||points[i-1].y===points[i].y&&points[i].y===points[i+1].y) points.splice(i,1);
            return points;
        };
        const xs=[...new Set([exit.x,entry.x,...boxes.flatMap(box=>[box.left,box.left+box.width]),...occupied.filter(seg=>seg.from!==request.from&&seg.a.x===seg.b.x).flatMap(seg=>[seg.a.x-TRACK,seg.a.x+TRACK])])];
        const ys=[...new Set([exit.y,entry.y,...boxes.flatMap(box=>[box.top,box.bottom]),...occupied.filter(seg=>seg.from!==request.from&&seg.a.y===seg.b.y).flatMap(seg=>[seg.a.y-TRACK,seg.a.y+TRACK])])];
        const candidates=[
            [exit,{x:entry.x,y:exit.y},entry],
            [exit,{x:exit.x,y:entry.y},entry],
            ...ys.map(y=>[exit,{x:exit.x,y},{x:entry.x,y},entry]),
            ...xs.map(x=>[exit,{x,y:exit.y},{x,y:entry.y},entry]),
        ];
        let best:RoutePoint[]|undefined,score=Infinity;
        for(const middle of candidates) {
            const points=compact(middle);
            const length=points.slice(1).reduce((n,p,i)=>n+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0)+points.length*24;
            if(length>=score||!clear(points))continue;
            const parallel = points.slice(1).some((b,i)=>occupied.some(seg=>seg.from!==request.from&&(points[i].x===b.x)===(seg.a.x===seg.b.x)&&trackConflict(points[i],b,seg.a,seg.b)));
            const cost=length+(parallel?100000:0);
            if(cost<score){best=points;score=cost;}
        }
        if(!best) {
            const rail=boundary-parents.indexOf(request.from)*TRACK;
            // Entry/exit tracks come from measured card boundaries, never move cards.
            for(const x of xs) for(const y of ys) {
                const points=compact([exit,{x,y:exit.y},{x,y},{x:rail,y},{x:rail,y:entry.y},entry]);
                if(clear(points)){best=points;break;}
            }
        }
        const points=best??[];
        points.slice(1).forEach((b,i)=>occupied.push({a:points[i],b,from:request.from}));
        return {...request,points,blocked:!best,d:points.map((p,i)=>`${i?"L":"M"} ${p.x} ${p.y}`).join(" ")};
    });
}

/** Independent crossings use a small overpass; shared BOM trunks stay connected. */
export function bridgeCostRoutes(edges: {from:string;to:string;bundle?:string[];d:string}[]): typeof edges {
    const segments=edges.map(edge=>{const n=edge.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);return {edge,a:{x:n[0],y:n[1]},b:edge.d.includes(" V ")?{x:n[0],y:n[2]}:{x:n[2],y:n[1]}};});
    return segments.map(({edge,a,b})=>{
        if(a.y!==b.y)return edge;
        const xs=[...new Set(segments.filter(v=>v.edge.from!==edge.from&&v.a.x===v.b.x&&v.a.x>Math.min(a.x,b.x)+6&&v.a.x<Math.max(a.x,b.x)-6&&a.y>Math.min(v.a.y,v.b.y)+6&&a.y<Math.max(v.a.y,v.b.y)-6).map(v=>v.a.x))].sort((x,y)=>x-y);
        if(!xs.length)return edge;
        let d=`M ${Math.min(a.x,b.x)} ${a.y}`,last=-Infinity;
        for(const x of xs)if(x-last>=12){d+=` H ${x-4} Q ${x} ${a.y-8} ${x+4} ${a.y}`;last=x;}
        return {...edge,d:d+` H ${Math.max(a.x,b.x)}`};
    });
}
