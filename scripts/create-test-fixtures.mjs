import fs from 'node:fs';
import crypto from 'node:crypto';
// Only synthetic disposable users. The SQL is applied through the authorized database connector.
const users=['Alex','Sam','Taylor'].map(name=>({id:crypto.randomUUID(),name,email:'fittt-test-'+crypto.randomUUID()+'@example.com',password:crypto.randomBytes(24).toString('hex')}));
fs.writeFileSync('.env.e2e.json',JSON.stringify(users));
fs.writeFileSync('.env.fixtures.sql',users.map(u=>`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) values('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated','${u.email}',extensions.crypt('${u.password}',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');`).join('\n'));
console.log('Created three synthetic test definitions; credentials are in ignored files.');
