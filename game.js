
export const CHARACTERS=["Revolverheldin","Sheriff","Goldgräberin","Gefangener","Banditin","Saloonbesitzer","Kopfgeldjäger"];
export const ACCESSORIES=["Sombrero","Zylinder","Partyhut","Sonnenbrille","Kopfhörer","Kochmütze","Krone"];
export const LOCATIONS=["Büro","Vulkan","Strand","Berge","Weltraum","Unterwasserwelt","Nachtclub"];

export function createDeck(){
  const deck=[];
  for(let c=0;c<7;c++) for(let a=0;a<7;a++) deck.push({c,a,l:(c+a)%7,id:deck.length});
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
  return deck;
}
export function related(card,secret){
  return card.c===secret.c || card.a===secret.a || card.l===secret.l;
}
export function publicState(game,viewer){
  return {
    phase:game.phase, current:game.current, deckCount:game.deck.length,
    players:game.players.map((p,i)=>({
      id:p.id,name:p.name,connected:p.connected,handCount:p.hand.length,
      relatedCount:p.related.length,notRelatedCount:p.notRelated.length,
      flipped:p.flipped,secret:i===viewer?null:p.secret,
      hand:i===viewer?p.hand:null
    })),
    answer:game.answer, pending:game.pending?{player:game.pending.player}:null,
    winner:game.winner
  };
}
export function createGame(){
  return {phase:"lobby",deck:[],players:[],current:0,answer:null,pending:null,winner:null};
}
export function startGame(game){
  game.deck=createDeck();
  game.players.forEach(p=>{p.secret=game.deck.pop();p.hand=[];p.related=[];p.notRelated=[];p.flipped=null});
  for(const p of game.players) for(let i=0;i<5;i++) p.hand.push(game.deck.pop());
  game.phase="playing";game.current=0;
}
