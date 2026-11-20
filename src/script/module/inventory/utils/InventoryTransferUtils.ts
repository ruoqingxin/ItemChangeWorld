import { InventoryRules as Rules } from "./InventoryRules";
import type { InventoryCommand, InventoryConfig, InventoryLocation, InventoryMove, InventoryState } from "../types/InventoryTypes";

export interface InventoryTransferPlan {
    command: InventoryCommand | null;
    moved: number;
    remaining: number;
    reason: string;
}

export class InventoryTransferUtils {
    static plan(config: InventoryConfig, snapshot: InventoryState, intoBag: boolean, page: number): InventoryTransferPlan {
        if(snapshot.phase==="ended"||snapshot.flow?.phase==="battle")
            throw new Error("当前不能整理物品");
        if(!Number.isSafeInteger(page)||page<0||page>=7)throw new Error("仓库页码无效");
        const active=snapshot.phase==="active",outside=active?"source":"warehouse";
        if(active&&snapshot.interactionSource!==snapshot.node)throw new Error("请先打开当前交互仓库");
        const projection=Rules.bagProjection(config,snapshot);
        if(intoBag&&projection.overflow.length)throw new Error("请先取出待整理物品");
        const reflow=!snapshot.bagColumns&&!projection.overflow.length;
        let state=reflow?projection.state:snapshot;
        const slots=active?Rules.sourcePlacements(config,state):Rules.warehousePlacements(config,state);
        const pageSlots=slots.filter(s=>s.page===page).sort((a,b)=>a.y-b.y||a.x-b.x);
        const candidates=intoBag?pageSlots.map(s=>state.items.find(i=>i.uid===s.uid))
            .filter(i=>!!i&&i.location.space===outside):
            state.items.filter(i=>i.location.space==="bag")
                .sort((a,b)=>a.location.y!-b.location.y!||a.location.x!-b.location.x!);
        const moves: InventoryMove[]=[];
        let reason="";
        for(const candidate of candidates){
            const item=Rules.item(state,candidate.uid),t=Rules.template(config,item);
            let accepted=false;
            const attempt=(to: InventoryLocation):boolean=>{
                const move: InventoryMove={uid:item.uid,from:{...item.location},to};
                try{
                    state=Rules.apply(config,state,{type:"move",move},state.enteredAt||0).state;
                    moves.push(move);return true;
                }catch(e){reason=(e as Error).message;return false;}
            };
            if(!intoBag)accepted=attempt(active?{space:"source",node:state.node}:{space:"warehouse"});
            else{
                const weight=Rules.weight(config,state);
                if(weight.current+t.weight>weight.limit){reason="背包负重不足";continue;}
                const preferred=!!pageSlots.find(s=>s.uid===item.uid)?.rotated;
                const [width,height]=Rules.size(config,state,"bag"),capacity=Rules.bagCapacity(config,state);
                const occupied=new Set<number>();
                for(const packed of state.items.filter(i=>i.location.space==="bag")){
                    const [w,h]=Rules.dimensions(Rules.template(config,packed),packed.location);
                    for(let y=0;y<h;y++)for(let x=0;x<w;x++)
                        occupied.add((packed.location.y!+y)*width+packed.location.x!+x);
                }
                const orientations=t.rotate&&t.width!==t.height?[preferred,!preferred]:[preferred];
                for(const rotated of orientations){
                    const [w,h]=Rules.dimensions(t,{space:"bag",rotated});
                    for(let y=0;y+h<=height&&!accepted;y++)for(let x=0;x+w<=width&&!accepted;x++){
                        if(state.bagColumns===7&&(y+h-1)*width+x+w>capacity)continue;
                        let free=true;
                        for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++)
                            if(occupied.has((y+dy)*width+x+dx))free=false;
                        if(!free)continue;
                        accepted=attempt({space:"bag",x,y,rotated});
                    }
                    if(accepted)break;
                }
                if(!accepted)reason="背包空间不足";
            }
        }
        const action: InventoryCommand | null=moves.length?{type:"moveBatch",moves}:null;
        return {command:action&&reflow?{type:"reflowBag",action}:action,
            moved:moves.length,remaining:candidates.length-moves.length,reason};
    }
}
