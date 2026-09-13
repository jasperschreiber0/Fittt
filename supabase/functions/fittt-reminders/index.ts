import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import webpush from "npm:web-push@3.6.7";
import { reminderDue, reminderPayload, pushEndpointAllowed } from "../../../lib/reminders.ts";

Deno.serve(async (req: Request) => {
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "Cache-Control": "private, no-store" } });
  if(req.method !== "POST") return json({ error: "Method not allowed" },405);
  const job = req.headers.get("x-fittt-job");
  if(!job || !/^[a-f0-9-]{36}$/i.test(job)) return json({error:"Unauthorized"},401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:claimed,error:claimError} = await db.from("fittt_push_jobs").update({consumed_at:new Date().toISOString()}).eq("id",job).is("consumed_at",null).gte("created_at",new Date(Date.now()-600000).toISOString()).select("id").maybeSingle();
  if(claimError || !claimed) return json({error:"Unauthorized"},401);
  let sent = 0, failed = 0, skipped = 0;
  const now = new Date();
  try {
    const {data:keys,error:keyError} = await db.rpc("fittt_push_keys");
    if(keyError || !keys?.fittt_push_private_key || !keys?.fittt_push_public_key) throw Error("Push not configured");
    webpush.setVapidDetails("https://fittt-production.up.railway.app",keys.fittt_push_public_key,keys.fittt_push_private_key);
    let lastId: string | null = null;
    for(;;) {
      let query = db.from("fittt_push_subscriptions").select("*").or("lunch.eq.true,evening.eq.true").order("id").limit(100);
      if(lastId) query=query.gt("id",lastId);
      const {data:subs,error} = await query;
      if(error) throw Error("Subscription read failed");
      for(const sub of subs || []) {
        try {
          const due = reminderDue(now,sub.timezone,sub.lunch,sub.evening);
          if(!due) continue;
          if(!pushEndpointAllowed(sub.endpoint)) { failed++; continue; }
          const key = {subscription_id:sub.id,day:due.day,slot:due.slot};
          const {error:insertError} = await db.from("fittt_push_deliveries").insert({...key,status:"claimed"});
          if(insertError) { if(insertError.code !== "23505") failed++; continue; }
          // Recheck consent after claiming, so disabled/deleted subscriptions stop.
          const {data:current,error:currentError} = await db.from("fittt_push_subscriptions").select("lunch,evening").eq("id",sub.id).maybeSingle();
          if(currentError) throw Error("Preference read failed");
          const since = new Date(now.getTime()-3600000).toISOString();
          const [entries,days] = await Promise.all([
            db.from("fittt_entries").select("id",{count:"exact",head:true}).eq("user_id",sub.user_id).gte("created_at",since),
            db.from("fittt_days").select("day",{count:"exact",head:true}).eq("user_id",sub.user_id).gte("updated_at",since)
          ]);
          if(entries.error || days.error) throw Error("Activity read failed");
          if(!current || !current[due.slot] || (entries.count || 0) + (days.count || 0) > 0) {
            await db.from("fittt_push_deliveries").update({status:"skipped"}).match(key); skipped++; continue;
          }
          try {
            await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify(reminderPayload(due.slot,due.day)),{TTL:900,urgency:"normal",timeout:10000});
            const {error:saveError} = await db.from("fittt_push_deliveries").update({status:"sent"}).match(key);
            if(saveError) failed++; else sent++;
          } catch(e) {
            const status = (e as {statusCode?:number}).statusCode;
            if(status===404 || status===410) await db.from("fittt_push_subscriptions").delete().eq("id",sub.id);
            else await db.from("fittt_push_deliveries").update({status:"failed"}).match(key);
            failed++;
          }
        } catch { failed++; }
      }
      if((subs || []).length < 100) break;
      lastId=subs![subs!.length-1].id;
    }
  } catch { failed++; }
  await db.from("fittt_push_jobs").update({finished_at:new Date().toISOString(),success:failed===0,sent}).eq("id",job);
  return json({ok:failed===0,sent,skipped,failed},failed?503:200);
});
