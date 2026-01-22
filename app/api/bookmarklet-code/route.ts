import { NextResponse } from 'next/server'

/**
 * API route to generate bookmarklet code with the correct domain
 * This ensures the bookmarklet points to the current environment (dev/prod)
 */
export async function GET(request: Request) {
  // Get the origin from the request headers
  const origin = request.headers.get('origin') ||
                 request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
                 'http://localhost:3000'

  // Generate the bookmarklet code
  const bookmarkletCode = generateBookmarkletCode(origin)

  return NextResponse.json({
    code: bookmarkletCode,
    origin,
  })
}

function generateBookmarkletCode(baseUrl: string): string {
  // The full bookmarklet code that will be minified
  const code = `
(function(){
  function sendToCorrespondenceClerk(){
    if(!window.location.hostname.includes('outlook')&&!window.location.hostname.includes('office.com')&&!window.location.hostname.includes('live.com')){
      alert('Please open this bookmarklet while viewing an email in Outlook Web.');
      return;
    }
    if(!window.extractOutlookEmail){
      loadExtractor();
      setTimeout(processEmail,500);
    }else{
      processEmail();
    }
  }
  function loadExtractor(){
    var script=document.createElement('script');
    script.src='${baseUrl}/outlook-extractor.js';
    script.onerror=function(){
      alert('Could not load email extractor. Please ensure Correspondence Clerk is accessible.');
    };
    document.head.appendChild(script);
  }
  function processEmail(){
    try{
      var emailData=window.extractOutlookEmail();
      if(!emailData||emailData.error){
        alert('Could not extract email data. Error: '+(emailData?.error||'Unknown error'));
        return;
      }
      var params=new URLSearchParams({
        emailSubject:emailData.subject||'',
        emailBody:emailData.body||'',
        emailFrom:emailData.from.name?emailData.from.name+' <'+emailData.from.email+'>':emailData.from.email,
        emailDate:emailData.date,
        emailTo:emailData.to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', '),
        emailRawContent:encodeURIComponent(emailData.raw_content||'')
      });
      var prefillUrl='${baseUrl}/new-entry?'+params.toString();
      window.open(prefillUrl,'_blank');
    }catch(error){
      console.error('Bookmarklet error:',error);
      alert('Error processing email: '+error.message);
    }
  }
  sendToCorrespondenceClerk();
})();
  `.trim()

  // Return as javascript: protocol URL
  return `javascript:${encodeURIComponent(code)}`
}
