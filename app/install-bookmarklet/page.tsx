'use client'

import { useState, useEffect, useRef } from 'react'

export default function InstallBookmarkletPage() {
  const [activeVersion, setActiveVersion] = useState<'production' | 'local'>('production')
  const [activeEmailClient, setActiveEmailClient] = useState<'outlook' | 'gmail'>('outlook')
  const [isReady, setIsReady] = useState(false)
  const bookmarkletRef = useRef<HTMLAnchorElement>(null)

  // Outlook bookmarklet code - Uses postMessage to bypass cross-domain auth issues
  const outlookProductionCode = `javascript:(function(){var url='https://correspondence-clerk.vercel.app';if(!window.location.hostname.includes('outlook')&&!window.location.hostname.includes('office.com')&&!window.location.hostname.includes('live.com')){alert('Please open while viewing an email in Outlook Web.');return;}function parseEmailAddress(text){if(!text)return{email:'',name:''};var emailRegex=/[\\w\\.-]+@[\\w\\.-]+\\.\\w+/;var match=text.match(emailRegex);var email=match?match[0]:'';var name='';if(text.includes('<')&&text.includes('>')){name=text.substring(0,text.indexOf('<')).trim();}else if(text!==email&&!text.includes('@')){name=text.trim();}return{email:email,name:name};}function extractBodyText(element){if(!element)return'';var clone=element.cloneNode(true);var sigs=clone.querySelectorAll('[class*="signature"],[id*="signature"]');sigs.forEach(function(s){s.remove();});var quoted=clone.querySelectorAll('[class*="quote"],[class*="reply"]');quoted.forEach(function(q){q.remove();});var text=clone.textContent||clone.innerText||'';text=text.replace(/\\n\\s*\\n\\s*\\n/g,'\\n\\n');return text.trim();}try{var subject='',body='',from={email:'',name:''},to=[],date=new Date().toISOString();var headings=document.querySelectorAll('[role="heading"]');var fromText='',toText='',dateText='';headings.forEach(function(h){var txt=h.textContent.trim();if(txt.includes('<')&&txt.includes('@')&&txt.includes('>')){fromText=txt;}else if(txt.startsWith('To:')||txt.startsWith('To:\\u200b')){toText=txt.replace(/^To:\\u200b?/,'').trim();}else if(txt.match(/\\d{2}\\/\\d{2}\\/\\d{4}\\s+\\d{2}:\\d{2}/)){dateText=txt;}});if(fromText){from=parseEmailAddress(fromText);}if(toText){to=[parseEmailAddress(toText)];}if(dateText){var parts=dateText.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+(\\d{2}):(\\d{2})/);if(parts){var d=new Date(parts[3],parts[2]-1,parts[1],parts[4],parts[5]);if(!isNaN(d.getTime()))date=d.toISOString();}}var subjectCandidates=document.querySelectorAll('h1,h2,h3,h4,[role="heading"]');for(var i=0;i<subjectCandidates.length;i++){var txt=subjectCandidates[i].textContent.trim();if(txt.length>5&&txt.length<200&&!txt.includes('@')&&!txt.startsWith('To:')&&!txt.startsWith('Cc:')&&!txt.match(/\\d{2}\\/\\d{2}\\/\\d{4}/)&&txt!=='Navigation pane'&&txt!=='Inbox'){subject=txt;break;}}var bodyEl=document.querySelector('[role="document"]')||document.querySelector('.customScrollBar')||document.querySelector('[role="main"]');body=extractBodyText(bodyEl);if(!body){alert('Could not extract email body.');return;}var fromStr=from.name?from.name+' <'+from.email+'>':from.email;var toStr=to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', ');var rawContent='From: '+fromStr+'\\nTo: '+toStr+'\\nDate: '+new Date(date).toLocaleString('en-GB')+'\\nSubject: '+subject+'\\n\\n'+body;var emailData={emailSubject:subject,emailBody:body,emailFrom:fromStr,emailFromEmail:from.email,emailFromName:from.name,emailDate:date,emailTo:toStr,emailRawContent:rawContent};var newWin=window.open(url+'/new-entry?awaitingEmail=1','_blank');if(!newWin){alert('Popup blocked. Please allow popups for Outlook.');return;}var attempts=0;var maxAttempts=50;var interval=setInterval(function(){attempts++;if(attempts>maxAttempts){clearInterval(interval);return;}try{newWin.postMessage({type:'OUTLOOK_EMAIL_DATA',data:emailData},url);}catch(e){}},200);}catch(error){alert('Error: '+error.message);}})();`

  // Gmail bookmarklet code - Extracts email data from Gmail web interface
  const gmailProductionCode = `javascript:(function(){var url='https://correspondence-clerk.vercel.app';if(!window.location.hostname.includes('mail.google.com')){alert('Please open while viewing an email in Gmail.');return;}function parseEmailAddress(text){if(!text)return{email:'',name:''};var emailRegex=/[\\w\\.-]+@[\\w\\.-]+\\.\\w+/;var match=text.match(emailRegex);var email=match?match[0]:'';var name='';if(text.includes('<')&&text.includes('>')){name=text.substring(0,text.indexOf('<')).trim();}else if(text!==email&&!text.includes('@')){name=text.trim();}return{email:email,name:name};}function extractBodyText(element){if(!element)return'';var clone=element.cloneNode(true);var quoted=clone.querySelectorAll('.gmail_quote,.gmail_extra,[class*="quote"]');quoted.forEach(function(q){q.remove();});var text=clone.textContent||clone.innerText||'';text=text.replace(/\\n\\s*\\n\\s*\\n/g,'\\n\\n');return text.trim();}try{var subject='',body='',from={email:'',name:''},to=[],date=new Date().toISOString();var subjectEl=document.querySelector('h2[data-thread-perm-id]')||document.querySelector('.hP');if(subjectEl){subject=subjectEl.textContent.trim();}var fromEl=document.querySelector('[email]')||document.querySelector('.gD');if(fromEl){var fromEmail=fromEl.getAttribute('email')||'';var fromName=fromEl.getAttribute('name')||fromEl.textContent.trim()||'';from={email:fromEmail,name:fromName};}var toEls=document.querySelectorAll('.g2');toEls.forEach(function(el){var toEmail=el.getAttribute('email')||'';var toName=el.getAttribute('name')||el.textContent.trim()||'';if(toEmail){to.push({email:toEmail,name:toName});}});var dateEl=document.querySelector('.g3')||document.querySelector('[title*=\":\"]');if(dateEl){var dateTitle=dateEl.getAttribute('title')||dateEl.textContent;try{var parsed=new Date(dateTitle);if(!isNaN(parsed.getTime())){date=parsed.toISOString();}}catch(e){}}var bodyEl=document.querySelector('.a3s.aiL')||document.querySelector('.ii.gt');body=extractBodyText(bodyEl);if(!body){alert('Could not extract email body. Make sure you have an email open.');return;}var fromStr=from.name?from.name+' <'+from.email+'>':from.email;var toStr=to.map(function(t){return t.name?t.name+' <'+t.email+'>':t.email;}).join(', ');var rawContent='From: '+fromStr+'\\nTo: '+toStr+'\\nDate: '+new Date(date).toLocaleString('en-GB')+'\\nSubject: '+subject+'\\n\\n'+body;var emailData={emailSubject:subject,emailBody:body,emailFrom:fromStr,emailFromEmail:from.email,emailFromName:from.name,emailDate:date,emailTo:toStr,emailRawContent:rawContent,emailSource:'gmail'};var newWin=window.open(url+'/new-entry?awaitingEmail=1','_blank');if(!newWin){alert('Popup blocked. Please allow popups for Gmail.');return;}var attempts=0;var maxAttempts=50;var interval=setInterval(function(){attempts++;if(attempts>maxAttempts){clearInterval(interval);return;}try{newWin.postMessage({type:'OUTLOOK_EMAIL_DATA',data:emailData},url);}catch(e){}},200);}catch(error){alert('Error: '+error.message);}})();`

  // Local dev versions
  const outlookLocalCode = outlookProductionCode.replace('https://correspondence-clerk.vercel.app', 'http://localhost:3000')
  const gmailLocalCode = gmailProductionCode.replace('https://correspondence-clerk.vercel.app', 'http://localhost:3000')

  // Select the appropriate code based on email client and environment
  const currentCode = activeEmailClient === 'outlook'
    ? (activeVersion === 'production' ? outlookProductionCode : outlookLocalCode)
    : (activeVersion === 'production' ? gmailProductionCode : gmailLocalCode)
  const currentUrl = activeVersion === 'production' ? 'https://correspondence-clerk.vercel.app' : 'http://localhost:3000'

  // Set href after mount to bypass React's javascript: URL blocking
  // Only mark as ready after verifying href was actually set
  useEffect(() => {
    setIsReady(false) // Reset when version or email client changes
    if (bookmarkletRef.current && currentCode) {
      bookmarkletRef.current.href = currentCode
      // Verify href was actually set before allowing drag
      if (bookmarkletRef.current.href.startsWith('javascript:')) {
        setIsReady(true)
      }
    }
  }, [currentCode, activeEmailClient])

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-black text-white text-center py-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-3">📧 Email → Correspondence Clerk</h1>
        <p className="text-xl md:text-2xl text-[#98bf64] font-medium">File emails in one click</p>
      </header>

      <div className="max-w-4xl mx-auto px-5 py-12">
        {/* Email Client Toggle */}
        <div className="flex gap-3 justify-center mb-6">
          <button
            onClick={() => setActiveEmailClient('outlook')}
            className={`px-8 py-3 border-2 border-[#333] font-semibold transition-all ${
              activeEmailClient === 'outlook'
                ? 'bg-[#0078d4] text-white border-[#0078d4]'
                : 'bg-white text-[#333] hover:bg-[#f5f5f5]'
            }`}
          >
            Outlook
          </button>
          <button
            onClick={() => setActiveEmailClient('gmail')}
            className={`px-8 py-3 border-2 border-[#333] font-semibold transition-all ${
              activeEmailClient === 'gmail'
                ? 'bg-[#ea4335] text-white border-[#ea4335]'
                : 'bg-white text-[#333] hover:bg-[#f5f5f5]'
            }`}
          >
            Gmail
          </button>
        </div>

        {/* Version Toggle */}
        <div className="flex gap-3 justify-center mb-10">
          <button
            onClick={() => setActiveVersion('production')}
            className={`px-8 py-3 border-2 border-[#98bf64] font-semibold transition-all ${
              activeVersion === 'production'
                ? 'bg-[#98bf64] text-white'
                : 'bg-white text-[#333] hover:bg-[#f5f5f5]'
            }`}
          >
            Production
          </button>
          <button
            onClick={() => setActiveVersion('local')}
            className={`px-8 py-3 border-2 border-[#98bf64] font-semibold transition-all ${
              activeVersion === 'local'
                ? 'bg-[#98bf64] text-white'
                : 'bg-white text-[#333] hover:bg-[#f5f5f5]'
            }`}
          >
            Local Dev
          </button>
        </div>

        {/* Installer Box */}
        <div className="bg-[#f5f5f5] border-3 border-[#333] p-10 text-center mb-10">
          <h2 className="text-2xl font-bold mb-5 text-[#333]">
            {activeEmailClient === 'outlook' ? 'Outlook' : 'Gmail'} Bookmarklet {activeVersion === 'local' && '(Local Dev)'}
          </h2>
          <p className="text-xl mb-8 text-[#777]">👇 Drag this button to your bookmarks bar</p>

          {/* Always keep anchor mounted, toggle visibility based on isReady */}
          <a
            ref={bookmarkletRef}
            className={isReady
              ? `inline-block px-12 py-6 text-white text-xl font-bold no-underline border-3 border-dashed border-[#333] cursor-move transition-all hover:scale-105 ${
                  activeEmailClient === 'outlook'
                    ? 'bg-[#0078d4] hover:bg-[#005a9e]'
                    : 'bg-[#ea4335] hover:bg-[#c5221f]'
                }`
              : "hidden"
            }
            draggable={isReady ? "true" : "false"}
            aria-hidden={!isReady}
          >
            📧 {activeEmailClient === 'outlook' ? 'Outlook' : 'Gmail'} → Clerk {activeVersion === 'local' && '(Local)'}
          </a>
          {!isReady && (
            <div className="inline-block px-12 py-6 bg-gray-400 text-white text-xl font-bold border-3 border-dashed border-[#333]">
              Preparing bookmarklet...
            </div>
          )}

          <p className="mt-5 text-sm text-[#777]">
            Points to: <code className="bg-white px-2 py-1">{currentUrl}</code>
          </p>

          {activeVersion === 'local' && (
            <div className="mt-5 bg-[#fff9e6] border-l-4 border-[#f4c430] p-4 text-left">
              <strong className="text-[#000]">Note:</strong> This version only works when Correspondence Clerk is running locally on port 3000.
            </div>
          )}
        </div>

        {/* Installation Steps */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-black border-b-3 border-[#98bf64] pb-3">
            How to Install
          </h2>
          <ol className="list-none space-y-4">
            {[
              {
                title: 'Make your bookmarks bar visible',
                content: 'In Chrome/Edge: Press Ctrl+Shift+B (Windows) or Cmd+Shift+B (Mac)\nIn Firefox: Right-click the toolbar and enable "Bookmarks Toolbar"'
              },
              {
                title: 'Drag the button above to your bookmarks bar',
                content: 'Click and hold on the button, then drag it up to your bookmarks toolbar'
              },
              {
                title: "That's it!",
                content: 'You can now click this bookmark whenever you\'re viewing an email in Outlook Web'
              }
            ].map((step, index) => (
              <li key={index} className="relative pl-20 py-5 bg-[#f5f5f5] border-l-4 border-[#98bf64]">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 w-9 h-9 bg-[#98bf64] text-white rounded-full flex items-center justify-center font-bold text-lg">
                  {index + 1}
                </div>
                <div>
                  <strong className="text-black text-lg">{step.title}</strong>
                  <p className="mt-1 text-[#333] whitespace-pre-line">{step.content}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* How to Use */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-black border-b-3 border-[#98bf64] pb-3">
            How to Use
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: '📧',
                title: 'Open an Email',
                description: activeEmailClient === 'outlook'
                  ? 'View any email in Outlook Web (outlook.com or office.com)'
                  : 'View any email in Gmail (mail.google.com)'
              },
              { icon: '📌', title: 'Click Bookmark', description: 'Click the bookmarklet you just installed in your bookmarks bar' },
              { icon: '✅', title: 'File It', description: 'Correspondence Clerk opens with the email pre-filled, ready to save' }
            ].map((step, index) => (
              <div key={index} className="bg-[#f5f5f5] p-8 text-center border-t-4 border-[#98bf64]">
                <div className="text-5xl mb-4">{step.icon}</div>
                <h3 className="text-xl font-bold mb-3 text-black">{step.title}</h3>
                <p className="text-[#777] text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Troubleshooting */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-black border-b-3 border-[#98bf64] pb-3">
            Troubleshooting
          </h2>
          <div className="space-y-4">
            {(activeEmailClient === 'outlook' ? [
              {
                title: "The bookmarklet doesn't work",
                content: "Make sure you're on an Outlook Web page:\n• outlook.com (consumer Outlook)\n• outlook.office.com (Office 365)\n• outlook.live.com\n\nThe bookmarklet won't work on the Outlook desktop app - you need to use the web version."
              },
              {
                title: "Can't drag the button",
                content: "Try these alternatives:\n• Right-click the button → \"Bookmark this link\" or \"Add to bookmarks\"\n• Manually create a bookmark: Copy the bookmarklet code and paste it as the bookmark URL\n• Make sure your browser allows JavaScript bookmarks (some security settings may block them)"
              },
              {
                title: '"Could not extract email body" error',
                content: "This means the bookmarklet can't find the email content. Try:\n• Make sure you have an email fully open (not just selected in the inbox)\n• Wait for the email to fully load before clicking the bookmarklet\n• Try a different email - some emails may have unusual formatting\n• Refresh the page and try again"
              },
              {
                title: "Email data doesn't appear in Correspondence Clerk",
                content: "If the tab opens but fields are empty:\n• Check your browser's console for errors (F12 → Console tab)\n• Make sure you're logged into Correspondence Clerk\n• Try closing the tab and clicking the bookmarklet again\n• Check that the URL matches your Correspondence Clerk installation"
              }
            ] : [
              {
                title: "The bookmarklet doesn't work",
                content: "Make sure you're on Gmail (mail.google.com).\n\nThe bookmarklet won't work on:\n• Gmail mobile app\n• Other email providers\n• Google Inbox (discontinued)"
              },
              {
                title: "Can't drag the button",
                content: "Try these alternatives:\n• Right-click the button → \"Bookmark this link\" or \"Add to bookmarks\"\n• Manually create a bookmark: Copy the bookmarklet code and paste it as the bookmark URL\n• Make sure your browser allows JavaScript bookmarks (some security settings may block them)"
              },
              {
                title: '"Could not extract email body" error',
                content: "This means the bookmarklet can't find the email content. Try:\n• Make sure you have an email fully open (click on it to open the full view)\n• Wait for the email to fully load before clicking the bookmarklet\n• Try a different email - some emails may have unusual formatting\n• Refresh the page and try again"
              },
              {
                title: "Email data doesn't appear in Correspondence Clerk",
                content: "If the tab opens but fields are empty:\n• Check your browser's console for errors (F12 → Console tab)\n• Make sure you're logged into Correspondence Clerk\n• Try closing the tab and clicking the bookmarklet again\n• Gmail may have updated their interface - try refreshing Gmail first"
              },
              {
                title: "Wrong sender or recipient extracted",
                content: "Gmail's interface can vary:\n• Make sure you're viewing a single email, not a thread summary\n• For email threads, open the specific message you want to file\n• The bookmarklet extracts from the currently visible email content"
              }
            ]).map((item, index) => (
              <details key={index} className="bg-[#f5f5f5] p-5 cursor-pointer border-l-4 border-[#98bf64]">
                <summary className="font-semibold text-lg text-black pl-3">{item.title}</summary>
                <p className="mt-4 pb-4 border-t border-[#777] pt-4 text-[#333] whitespace-pre-line">{item.content}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Support Section */}
        <div className="bg-black text-white p-10 text-center -mx-5">
          <h2 className="text-3xl font-bold mb-4">Need More Help?</h2>
          <p className="mb-4">
            View the full documentation:{' '}
            <a href="/help" className="text-[#98bf64] font-semibold hover:underline">
              User Guide
            </a>
          </p>
          <p>
            Or read the technical documentation:{' '}
            <a
              href="https://github.com/tomapperley8-del/correspondence-clerk/blob/master/OUTLOOK_INTEGRATION.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#98bf64] font-semibold hover:underline"
            >
              Outlook Integration Guide
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
