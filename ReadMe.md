Project for stock analysis

- Added backend for processing

- To process a company, run python company_processing_pipeline.py 
In company_processing_pipeline.py, add the ticker in the parameter that you want to process


- To build the node docker container:
 docker build -t stock-backend .

- To run the node docker container:
 docker run -d -p 5001:5001 --name stock-backend-container --env-file .env stock-backend 