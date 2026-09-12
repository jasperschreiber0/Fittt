import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { buildReview, dueReviewEnd, addDays } from "../../../lib/intelligence.ts";
import { profileSchema } from "../../../lib/engine.ts";

Deno.serve(async (req: Request) => {
  const json = (b: unknown, status=200) => Response.json(b,{status,headers:{"Cache-Control":"private, no-store"}});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const job=req.headers.get("x-fittt-job");
  let uid: string | null=null;
  if(job) {
    if(!/^[a-f0-9-]{36}$/i.test(job))return json({error:"Unauthorized"},401);
    const {data,error}=await admin.from("fittt_review_jobs").update({consumed_at:new Date().toISOString()}).eq("id",job).is("consumed_at",null).gte("created_at",new Date(Date.now()-600000).toISOString()).select("id").maybeSingle();
    if(error||!data)return json({error:"Unauthorized"},401);
  } else {
    const token=req.headers.get("Authorization")?.replace(/^Bearer /i,"");
    if(!token)return json({error:"Unauthorized"},401);
    const {data,error}=await admin.auth.getUser(token);
    if(error||!data.user)return json({error:"Unauthorized"},401);
    uid=data.user.id;
  }
  let processed=0,failed=0;
  try {
    for(let offset=0;;offset+=100) {
      let q=admin.from("fittt_profiles").select("user_id,data").order("user_id").range(offset,offset+99);
      if(uid)q=q.eq("user_id",uid);
      const {data:profiles,error}=await q;
      if(error)throw Error("Profile read failed");
      for(const row of profiles||[]) {
        try {
          const profile=profileSchema.parse(row.data), end=dueReviewEnd(profile.timezone);
          if(end<profile.start)continue;
          const {data:existing,error:readError}=await admin.from("fittt_reviews").select("input_hash").eq("user_id",row.user_id).eq("review_end",end).maybeSingle();
          if(readError)throw readError;
          // The hourly worker writes once per week; explicit owner refresh updates corrected logs.
          if(job&&existing)continue;
          const specs=["entries","days","weights","events"] as const;
          const result=await Promise.all(specs.map(name=>admin.from("fittt_"+name).select("*").eq("user_id",row.user_id).gte("day",addDays(end,-35)).lte("day",name==="events"?addDays(end,7):end).order("day").limit(5000)));
          if(result.some(r=>r.error||r.data?.length===5000))throw Error("Incomplete data read");
          const context={profile,entries:result[0].data||[],days:result[1].data||[],weights:result[2].data||[],events:result[3].data||[]};
          const input=JSON.stringify({version:1,end,context});
          const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input));
          const hash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
          if(existing?.input_hash===hash)continue;
          const payload=buildReview(context,end);
          const {error:saveError}=await admin.from("fittt_reviews").upsert({user_id:row.user_id,review_end:end,input_hash:hash,payload,generated_at:new Date().toISOString()},{onConflict:"user_id,review_end"});
          if(saveError)throw saveError;
          processed++;
        } catch { failed++; }
      }
      if(uid||(profiles?.length||0)<100)break;
    }
    if(job)await admin.from("fittt_review_jobs").update({finished_at:new Date().toISOString(),success:failed===0,processed}).eq("id",job);
    return json({ok:failed===0,processed,failed},failed?503:200);
  } catch {
    if(job)await admin.from("fittt_review_jobs").update({finished_at:new Date().toISOString(),success:false,processed}).eq("id",job);
    return json({error:"Review temporarily unavailable"},503);
  }
});
