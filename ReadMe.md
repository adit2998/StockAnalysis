Project for stock analysis


Command to start/stop mongodb locally

`brew services start mongodb/brew/mongodb-community`

`brew services stop mongodb/brew/mongodb-community`


- Added backend for processing

- To process a company, run python company_processing_pipeline.py 
In company_processing_pipeline.py, add the ticker in the parameter that you want to process


- To build the node docker container:
 docker build -t stock-backend .

- To run the node docker container:
 docker run -d -p 5001:5001 --name stock-backend-container --env-file .env stock-backend 


- Two flows possible: one with local development and one with containers
 The .env.local file should take care of the local. 
 For node to pick up from local mongo, run the brew services start command. 
 Run this command now to start node locally:
 `NODE_ENV=local node server.js`
 Run the front end as usual:
 `npm start`

 But if running node from a container, stop the brew services since mongo port 27017 will cause issues. 

 For running the python file processing function from local, run this:
 `ENV=local python company_processing_pipeline.py`

 Else if docker containers are up, simply run this:
 `python company_processing_pipeline.py`