import { NextRequest, NextResponse } from 'next/server'

/**
 * API route to generate bookmarklet code
 * Always returns the production URL to avoid preview deployment issues
 * Uses self-contained postMessage approach (no external script loading)
 * Supports ?provider=outlook (default) or ?provider=gmail
 * v2: Extracts all emails in thread and sends array for user selection
 */

const PRODUCTION_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://correspondence-clerk.vercel.app'

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider') || 'outlook'

  const bookmarkletCode = provider === 'gmail'
    ? generateGmailBookmarkletCode()
    : generateOutlookBookmarkletCode()

  return NextResponse.json({
    code: bookmarkletCode,
    origin: PRODUCTION_URL,
    provider,
  })
}

function generateOutlookBookmarkletCode(): string {
  const code = `javascript:(function(){
var url='${PRODUCTION_URL}';
if(!window.location.hostname.includes('outlook')&&!window.location.hostname.includes('office.com')&&!window.location.hostname.includes('live.com')){alert('Please open while viewing an email in Outlook Web.');return;}
function parseEmailAddress(text){if(!text)return{email:'',name:''};var emailRegex=/[\\w\\.-]+@[\\w\\.-]+\\.\\w+/;var match=text.match(emailRegex);var email=match?match[0]:'';var name='';if(text.includes('<')&&text.includes('>')){name=text.substring(0,text.indexOf('<')).trim();}else if(text!==email&&!text.includes('@')){name=text.trim();}return{email:email,name:name};}
function extractBodyText(el){if(!el)return'';var clone=el.cloneNode(true);clone.querySelectorAll('[class*="signature"],[id*="signature"]').forEach(function(s){s.remove();});clone.querySelectorAll('[class*="quote"],[class*="reply"]').forEach(function(q){q.remove();});return(clone.textContent||clone.innerText||'').replace(/\\n\\s*\\n\\s*\\n/g,'\\n\\n').trim();}
function extractSingleEmail(container){
  var subject='',body='',from={email:'',name:''},to=[],date=new Date().toISOString();
  var headings=container.querySelectorAll?container.querySelectorAll('[role="heading"]'):[];
  var fromText='',toText='',dateText='';
  headings.forEach(function(h){var txt=h.textContent.trim();if(txt.includes('<')&&txt.includes('@')&&txt.includes('>')){fromText=txt;}else if(txt.startsWith('To:')||txt.startsWith('To:\\u200b')){toText=txt.replace(/^To:\\u200b?/,'').trim();}else if(txt.match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s+\\d{2}:\\d{2}/)){dateText=txt;}});
  if(fromText)from=parseEmailAddress(fromText);
  if(toText)to=[parseEmailAddress(toText)];
  if(dateText){var parts=dateText.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+(\\d{2}):(\\d{2})/);if(parts){var d=new Date(parts[3],parts[2]-1,parts[1],parts[4],parts[5]);if(!isNaN(d.getTime()))date=d.toISOString();}}
  var subjectCandidates=container.querySelectorAll?container.querySelectorAll('h1,h2,h3,h4,[role="heading"]'):[];
  for(var i=0;i<subjectCandidates.length;i++){var txt=subjectCandidates[i].textContent.trim();if(txt.length>5&&txt.length<200&&!txt.includes('@')&&!txt.startsWith('To:')&&!txt.startsWith('Cc:')&&!txt.match(/\\d{2}\\/\\d{2}\\/\\d{4}/)&&txt!=='Navigation pane'&&txt!=='Inbox'){subject=txt;break;}}
  var bodyEl=(container.querySelector?container.querySelector('[role="document"]'):null)||(container.querySelector?container.querySelector('.customScrollBar'):null);
  body=extractBodyText(bodyEl||container);
  var fromStr=from.name?from.name+' <'+from.email+'>':from.email;
  var toStr=to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', ');
  var rawContent='From: '+fromStr+'\\nTo: '+toStr+'\\nDate: '+new Date(date).toLocaleString('en-GB')+'\\nSubject: '+subject+'\\n\\n'+body;
  return{emailSubject:subject,emailBody:body,emailFrom:fromStr,emailFromEmail:from.email,emailFromName:from.name,emailDate:date,emailTo:toStr,emailRawContent:rawContent};
}
try{
  var emails=[];
  var threadItems=document.querySelectorAll('[role="listitem"],[data-convid]');
  if(threadItems.length>1){
    threadItems.forEach(function(item){
      var doc=item.querySelector('[role="document"]');
      if(doc){var e=extractSingleEmail(item);if(e.emailBody)emails.push(e);}
    });
  }
  if(emails.length===0){
    var e=extractSingleEmail(document);
    if(!e.emailBody){alert('Could not extract email body.');return;}
    emails.push(e);
  }
  var newWin=window.open(url+'/new-entry?awaitingEmail=1','_blank');
  if(!newWin){alert('Popup blocked. Please allow popups for Outlook.');return;}
  var attempts=0;var interval=setInterval(function(){
    attempts++;if(attempts>50){clearInterval(interval);return;}
    try{newWin.postMessage({type:'EMAIL_IMPORT',emails:emails},url);}catch(e){}
  },200);
}catch(error){alert('Error: '+error.message);}
})();`.replace(/\n/g, '')

  return code
}

function generateGmailBookmarkletCode(): string {
  const code = `javascript:(function(){
var url='${PRODUCTION_URL}';
if(!window.location.hostname.includes('mail.google.com')){alert('Please open while viewing an email in Gmail.');return;}
function parseEmailAddress(text){if(!text)return{email:'',name:''};var emailRegex=/[\\w\\.-]+@[\\w\\.-]+\\.\\w+/;var match=text.match(emailRegex);var email=match?match[0]:'';var name='';if(text.includes('<')&&text.includes('>')){name=text.substring(0,text.indexOf('<')).trim();}else if(text!==email&&!text.includes('@')){name=text.trim();}return{email:email,name:name};}
function extractBodyText(el){if(!el)return'';var clone=el.cloneNode(true);clone.querySelectorAll('.gmail_signature,[data-smartmail="gmail_signature"]').forEach(function(s){s.remove();});clone.querySelectorAll('.gmail_quote,[class*="gmail_quote"]').forEach(function(q){q.remove();});return(clone.textContent||clone.innerText||'').replace(/\\n\\s*\\n\\s*\\n/g,'\\n\\n').trim();}
function extractGmailMessage(msgEl){
  var from={email:'',name:''},date=new Date().toISOString(),subject='';
  var fromEl=msgEl.querySelector('span[email][name],span[email],.gD');
  if(fromEl){var emailAttr=fromEl.getAttribute('email');var nameAttr=fromEl.getAttribute('name')||fromEl.textContent.trim();if(emailAttr)from={email:emailAttr,name:nameAttr||''};}
  var dateEl=msgEl.querySelector('span.g3,span[data-timestamp]');
  if(dateEl){var ts=dateEl.getAttribute('data-timestamp');if(ts){var pd=new Date(parseInt(ts));if(!isNaN(pd.getTime()))date=pd.toISOString();}else{var title=dateEl.getAttribute('title');if(title){var pd2=new Date(title);if(!isNaN(pd2.getTime()))date=pd2.toISOString();}}}
  var bodyEl=msgEl.querySelector('.a3s.aiL')||msgEl.querySelector('.a3s');
  var body=extractBodyText(bodyEl);
  if(!body)return null;
  var fromStr=from.name?from.name+' <'+from.email+'>':from.email;
  var rawContent='From: '+fromStr+'\\nDate: '+new Date(date).toLocaleString('en-GB')+'\\nSubject: '+subject+'\\n\\n'+body;
  return{emailSubject:subject,emailBody:body,emailFrom:fromStr,emailFromEmail:from.email,emailFromName:from.name,emailDate:date,emailTo:'',emailRawContent:rawContent,emailSourceMetadata:JSON.stringify({web_link:window.location.href,import_source:'gmail_web'})};
}
try{
  var subject='';
  var subjectSelectors=['h2[data-thread-perm-id]','h2.hP','div.ha h2'];
  for(var s=0;s<subjectSelectors.length;s++){var subjectEl=document.querySelector(subjectSelectors[s]);if(subjectEl&&subjectEl.textContent){subject=subjectEl.textContent.trim();break;}}
  if(!subject){var mainH2s=document.querySelectorAll('[role="main"] h2');for(var h=0;h<mainH2s.length;h++){var txt=mainH2s[h].textContent.trim();if(txt&&txt.length>0&&txt.length<500){subject=txt;break;}}}
  var emails=[];
  var messageEls=document.querySelectorAll('[data-message-id]');
  if(messageEls.length>0){
    messageEls.forEach(function(msgEl){
      var bodyEl=msgEl.querySelector('.a3s.aiL')||msgEl.querySelector('.a3s');
      if(bodyEl){var e=extractGmailMessage(msgEl);if(e){e.emailSubject=subject;e.emailRawContent='From: '+e.emailFrom+'\\nDate: '+new Date(e.emailDate).toLocaleString('en-GB')+'\\nSubject: '+subject+'\\n\\n'+e.emailBody;emails.push(e);}}
    });
  }
  if(emails.length===0){
    var fromEl2=document.querySelector('span[email][name],span[email],.gD');
    var from2={email:'',name:''};
    if(fromEl2){var ea=fromEl2.getAttribute('email');var na=fromEl2.getAttribute('name')||fromEl2.textContent.trim();if(ea)from2={email:ea,name:na||''};}
    var dateEl2=document.querySelector('span.g3,span[data-timestamp]');
    var date2=new Date().toISOString();
    if(dateEl2){var ts2=dateEl2.getAttribute('data-timestamp');if(ts2){var pd3=new Date(parseInt(ts2));if(!isNaN(pd3.getTime()))date2=pd3.toISOString();}else{var t2=dateEl2.getAttribute('title');if(t2){var pd4=new Date(t2);if(!isNaN(pd4.getTime()))date2=pd4.toISOString();}}}
    var bodyEl2=document.querySelector('.a3s.aiL,.a3s');
    var body2=extractBodyText(bodyEl2);
    if(!body2){alert('Could not extract email body from Gmail.');return;}
    var fromStr2=from2.name?from2.name+' <'+from2.email+'>':from2.email;
    emails.push({emailSubject:subject,emailBody:body2,emailFrom:fromStr2,emailFromEmail:from2.email,emailFromName:from2.name,emailDate:date2,emailTo:'',emailRawContent:'From: '+fromStr2+'\\nDate: '+new Date(date2).toLocaleString('en-GB')+'\\nSubject: '+subject+'\\n\\n'+body2,emailSourceMetadata:JSON.stringify({web_link:window.location.href,import_source:'gmail_web'})});
  }
  var newWin=window.open(url+'/new-entry?awaitingEmail=1','_blank');
  if(!newWin){alert('Popup blocked. Please allow popups for Gmail.');return;}
  var attempts=0;var interval=setInterval(function(){
    attempts++;if(attempts>50){clearInterval(interval);return;}
    try{newWin.postMessage({type:'EMAIL_IMPORT',emails:emails},url);}catch(e){}
  },200);
}catch(error){alert('Error: '+error.message);}
})();`.replace(/\n/g, '')

  return code
}
