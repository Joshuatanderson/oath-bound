# Frontend outline

## Home page
### waitlist form CTA
Super simple form collection. Typeform or similar that can be embedded directly in the page; maybe best not Typeform. I don't know, either something free that we can ship really quickly that looks good, like Typeform, or something that we can build just to have two or three things in it, like their email, phone number, role (Skill creator, developer, enterprise, investor, et cetera)

### Skills registry
In the beginning we'll want for this to be super simple and we'll likely fake the skills registry. After all we will not have audits so these will be from, like, Example Audit or, like, Jane Doe Street Audit Firm. 
The actual mechanics of the registry can be found in registry-prd.md. 

### Skills creation
This for now should probably just show the process at least for the very first, which will be "Secure ID scan via Persona". Should be the first thing. I think the second thing will be Creating an ERC-8004 token. I'm not sure if that should show up in the UI or if that should just live in the background but we'll do that. We're going to have to think about how we present this because really what it is, they'll be making an account. They'll be tying it to some sort of identity. I'm not 100% sure UI-wise if it makes sense to do this so that they do the account and we put it in their name or if we do the account and we just hold their identity. I think ERC-8004 tokens might be soul-bound so I'm not 100% sure how that should work. We'll probably want a clean way to either let someone use an existing ERC-8004 or not.

When we verify with persona, we're going to write the result of that to the chain, basically just the person's name and that they are over 18 or 18 or over potentially. We might just get the name. I don't know what our liabilities here are. I'm assuming if people are going to be monetizing their skills, we will want to make sure that they're adults, just to smooth over legal complexity and not have to worry about edge cases of who's defined as a minor in which country. There's a lot of complexity in the sign-up process but for the demo we don't need to worry about it. 

### Backend 
- In order to keep this stupid simple, I will probably go with TypeScript so that I can actually read it and as strongly typed as possible. I forget the name of, I think Elucia is the one that uses the bun run time and is very strongly typed. 
- We are not trying to do anything clever on the backend. Ellusia for type safety. Postgres via superbase will likely be what we do for the backend. I think most of the complexity here will actually be in smart contracts or in other things that write to the chain. Most storage will be done on chain and not in our database.

We will also likely be mirroring over many different chains, at least two, and in the beginning although it might end up being a little expensive, writing to SUI and to hedera, both of which have fairly low costs. This is going to be the simplest way to do it. 

At some point I will strengthen this into backend-prd.md, but for now we're keeping this stupid simple.
